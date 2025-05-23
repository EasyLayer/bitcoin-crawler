import 'reflect-metadata';
import './utils/check-node-version';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { NestLogger } from '@easylayer/common/logger';
import type { CustomEventBus } from '@easylayer/common/cqrs';
import { CqrsModule } from '@easylayer/common/cqrs';
import { BitcoinAppModule } from './app.module';
import { AppConfig } from './config';
import type { ModelType } from './framework';

interface BootstrapOptions {
  Models: ModelType[];
  rpc?: boolean;
  ws?: boolean;
  tcp?: boolean;
  ipc?: boolean;
  testing?: TestingOptions;
}

export interface TestingOptions {
  handlerEventsToWait?: EventWaiter[];
  sagaEventsToWait?: EventWaiter[];
}

interface EventWaiter<T = any> {
  eventType: new (...args: any[]) => T;
  count: number;
}

export const bootstrap = async ({
  Models,
  rpc,
  ws,
  tcp,
  ipc,
  testing = {},
}: BootstrapOptions): Promise<INestApplicationContext | INestApplication | void> => {
  // IMPORTANT: we use dotenv here to load envs globally.
  // It has to be before importing all plugins.
  config({ path: resolve(process.cwd(), '.env') });

  const logger = new NestLogger();

  try {
    // Register root application module
    const rootModule = await BitcoinAppModule.register({ Models, ws, tcp, ipc });
    let appContext: INestApplicationContext | INestApplication;

    // Determine transport mode flags
    const isTcpOnly = !rpc && !ws && !!tcp && !ipc;
    const isIpcOnly = !rpc && !ws && !tcp && !!ipc && !!process.send;
    const isNoTransport = !rpc && !ws && !tcp && !ipc;

    // Create appropriate Nest context
    if (isTcpOnly) {
      appContext = await NestFactory.createMicroservice<MicroserviceOptions>(rootModule, {
        transport: Transport.TCP,
        logger,
      });
    } else if (isIpcOnly || isNoTransport) {
      appContext = await NestFactory.createApplicationContext(rootModule, { logger });
    } else {
      appContext = await NestFactory.create(rootModule, { logger });
    }

    // Setup graceful shutdown handlers
    setupGracefulShutdownHandlers(appContext, logger);

    // Retrieve AppConfig from context
    const config = appContext.get(AppConfig);

    // Prepare test event subscribers if running in TEST mode
    let testPromises: Promise<void>[] = [];
    if (config.isTEST()) {
      testPromises = setupTestEventSubscribers(appContext, testing);
    }

    // Start transports
    if (isTcpOnly) {
      // Start pure TCP microservice
      await (appContext as any).listen({
        transport: Transport.TCP,
        options: {
          host: config.TCP_HOST,
          port: config.TCP_PORT,
        },
      });
      logger.log(`TCP microservice listening on ${config.TCP_HOST}:${config.TCP_PORT}`, 'Bootstrap');
    } else if (isIpcOnly || isNoTransport) {
      await appContext.init();
    } else {
      // Start HTTP/WS server
      const app = appContext as INestApplication;
      await app.listen(config.HTTP_PORT, config.HTTP_HOST);
      logger.log(`HTTP server listening on ${config.HTTP_HOST}:${config.HTTP_PORT}`, 'Bootstrap');

      // Optionally connect TCP microservice in hybrid mode
      if (tcp) {
        connectTcpMicroservice(app, logger, config);
        await app.startAllMicroservices();
        logger.log(`Hybrid TCP microservice started on ${config.TCP_HOST}:${config.TCP_PORT}`, 'Bootstrap');
      }
    }

    // If test subscribers exist, wait for events and then close
    if (testPromises.length > 0) {
      await Promise.all(testPromises);
      await appContext.close();
      return appContext;
    }

    // IMPORTANT: only for test mode
    if (config.isTEST()) {
      return appContext;
    }
  } catch (err) {
    logger.error(`Bootstrap failed: ${err}`, '', 'Bootstrap');
    process.exit(1);
  }
};

/**
 * Connects a TCP microservice to an existing HTTP application (hybrid mode).
 */
function connectTcpMicroservice(app: INestApplication, logger: NestLogger, config: AppConfig) {
  app.connectMicroservice({
    transport: Transport.TCP,
    options: { host: config.TCP_HOST, port: config.TCP_PORT },
  });
  logger.log('Connected TCP microservice in hybrid mode', 'Bootstrap');
}

/**
 * Sets up graceful shutdown on SIGINT and SIGTERM.
 */
function setupGracefulShutdownHandlers(app: INestApplicationContext | INestApplication, logger: NestLogger) {
  process.on('SIGINT', () => gracefulShutdown(app, logger));
  process.on('SIGTERM', () => gracefulShutdown(app, logger));
}

/**
 * Performs graceful shutdown of the application.
 */
async function gracefulShutdown(app: INestApplicationContext | INestApplication, logger: NestLogger) {
  logger.log('Graceful shutdown initiated...', 'Bootstrap');
  setTimeout(async () => {
    try {
      logger.log('Closing application...', 'Bootstrap');
      await app.close();
    } catch (error) {
      logger.error('Error during shutdown', '', 'Bootstrap');
      process.exit(1);
    } finally {
      logger.log('Application closed successfully.', 'Bootstrap');
      process.exit(0);
    }
  }, 0);
}

/**
 * Prepares Promises that resolve when specified events are processed by handlers or sagas.
 */
function setupTestEventSubscribers(
  app: INestApplicationContext | INestApplication,
  testing: TestingOptions
): Promise<void>[] {
  const cqrs: any = app.get(CqrsModule);
  const eventBus = cqrs.eventBus as CustomEventBus;

  const promises: Promise<void>[] = [];

  if (testing.handlerEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.eventHandlerCompletion$, testing.handlerEventsToWait));
  }

  if (testing.sagaEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.sagaCompletion$, testing.sagaEventsToWait));
  }

  return promises;
}

/**
 * Creates an array of Promises for event completion based on waiters.
 */
function createCompletionPromises<E>(stream$: Observable<E>, waiters?: EventWaiter<E>[]): Promise<void>[] {
  return waiters?.filter((w) => w.count > 0).map((w) => createCompletionPromise(stream$, w.eventType, w.count)) || [];
}

/**
 * Returns a Promise that resolves after the specified number of events of given class are emitted.
 */
function createCompletionPromise<E>(
  stream$: Observable<E>,
  EventClass: new (...args: any[]) => E,
  expectedCount: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let seen = 0;
    const sub = stream$.pipe(filter((ev) => ev instanceof EventClass)).subscribe({
      next: () => {
        seen += 1;
        if (seen >= expectedCount) {
          sub.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        sub.unsubscribe();
        reject(err);
      },
    });
  });
}
