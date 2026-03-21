import 'reflect-metadata';
// NOTE: no 'dotenv/config' — browser has no filesystem
// NOTE: no '../utils' — check-node-version is Node-only
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { NestLogger } from '@easylayer/common/logger';
import { ModelFactoryService } from '../domain-layer/framework';
import { BrowserContainerModule } from './container.module';
import type { BrowserContainerModuleOptions } from './container.module';
import { AppService } from '../app.service';
import { getUnifiedEnv } from '../config/unified-env';

export type BrowserBootstrapOptions = Omit<BrowserContainerModuleOptions, 'appName'>;

/**
 * Browser / Electron renderer bootstrap.
 *
 * Configuration is read from self.__ENV (SharedWorker) or window.__ENV (browser tab)
 * or process.env (Electron renderer). Set before loading the bundle:
 *
 *   window.__ENV = {
 *     NETWORK_TYPE: 'mainnet',
 *     PROVIDER_NETWORK_RPC_URLS: 'http://localhost:8332',
 *     TRANSPORT_OUTBOX_ENABLE: '1',
 *     TRANSPORT_OUTBOX_KIND: 'electron-ipc-renderer',
 *   };
 */
export const bootstrapBrowser = async ({
  Models,
  QueryHandlers,
  EventHandlers,
  Providers,
}: BrowserBootstrapOptions = {}): Promise<INestApplicationContext> => {
  const env = getUnifiedEnv();
  const appName = env.APPLICATION_NAME || 'bitcoin';

  const allowedLevels = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
  const envLevel = (env.LOG_LEVEL || '').toLowerCase();
  const loggerLevel = allowedLevels.has(envLevel) ? (envLevel as any) : env.TRACE === '1' ? 'trace' : 'info';

  const rootModule = await BrowserContainerModule.register({
    appName,
    Models,
    QueryHandlers,
    EventHandlers,
    Providers,
  });

  const appContext = await NestFactory.createApplicationContext(rootModule as any, {
    bufferLogs: true,
    abortOnError: false,
  });

  const logger = new NestLogger({
    name: appName,
    level: loggerLevel,
    enabled: true,
  });

  appContext.useLogger(logger);

  try {
    await appContext.init();

    // After init the DI container is ready — populate services ref so that
    // factory query handlers can access ModelFactoryService at execute() time.
    const servicesRef = appContext.get<{ value?: any }>('QUERY_FACTORY_SERVICES_REF', {
      strict: false,
    });
    if (servicesRef) {
      const modelFactory = appContext.get(ModelFactoryService, { strict: false });
      servicesRef.value = { modelFactory };
    }

    const appService = appContext.get(AppService, { strict: false });
    await appService.init();

    logger.log('Bitcoin crawler started in browser mode', 'Bootstrap');

    return appContext;
  } catch (err) {
    const trace = err instanceof Error ? err.stack : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Browser bootstrap failed: ${msg}`, trace, 'Bootstrap');
    throw err;
  }
};
