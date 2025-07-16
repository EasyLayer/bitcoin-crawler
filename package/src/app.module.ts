import { Module, DynamicModule } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsModule, EventPublisher } from '@easylayer/common/cqrs';
import type { IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { AppLogger, LoggerModule } from '@easylayer/common/logger';
import { ArithmeticService } from '@easylayer/common/arithmetic';
import { EventStoreModule, EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { TransportModule, TransportModuleOptions } from '@easylayer/common/network-transport';
import {
  Network,
  BlockchainProviderModule,
  BlocksQueueModule,
  NodeProviderTypes,
  NetworkConfig,
  RateLimits,
} from '@easylayer/bitcoin';
import { AppService } from './app.service';
import { NetworkSaga } from './application-layer/sagas';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  CqrsFactoryService,
} from './application-layer/services';
import { NetworkModelFactoryService, ConsolePromptService, NETWORK_AGGREGATE_ID } from './domain-layer/services';
import { CommandHandlers } from './domain-layer/command-handlers';
import { EventsHandlers } from './domain-layer/events-handlers';
import { QueryHandlers } from './domain-layer/query-handlers';
import { AppConfig, BusinessConfig, EventStoreConfig, BlocksQueueConfig, ProvidersConfig } from './config';
import { ModelType, ModelFactoryService } from './framework';
import { MetricsService } from './metrics.service';

const appName = `${process?.env?.BITCOIN_CRAWLER_APPLICATION_NAME || 'bitcoin'}`;

export const EVENTSTORE_NAME = `${appName}-eventstore`;

interface AppModuleOptions {
  Models: ModelType[];
  QueryHandlers?: Array<new (...args: any[]) => IQueryHandler>;
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
}

@Module({})
export class AppModule {
  static async register({
    Models,
    QueryHandlers: UserQueryHandlers = [],
    EventHandlers: UserEventHandlers = [],
  }: AppModuleOptions): Promise<DynamicModule> {
    const eventstoreConfig = await transformAndValidate(EventStoreConfig, process.env, {
      validator: { whitelist: true },
    });
    const appConfig = await transformAndValidate(AppConfig, process.env, {
      validator: { whitelist: true },
    });
    const businessConfig = await transformAndValidate(BusinessConfig, process.env, {
      validator: { whitelist: true },
    });
    const blocksQueueConfig = await transformAndValidate(BlocksQueueConfig, process.env, {
      validator: { whitelist: true },
    });
    const providersConfig = await transformAndValidate(ProvidersConfig, process.env, {
      validator: { whitelist: true },
    });

    const queueIteratorBlocksBatchSize = businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 8;
    const minTransferSize = businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_SIZE - 1;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0 });
    // Create instances of models without merging for basic instances
    const userModels = Models.map((ModelCtr) => new ModelCtr());

    // Smart transport detection using helper methods
    const transports = appConfig.getEnabledTransports();

    // Network configuration
    const network: NetworkConfig = {
      network: businessConfig.BITCOIN_CRAWLER_NETWORK_TYPE as NetworkConfig['network'],
      nativeCurrencySymbol: businessConfig.BITCOIN_CRAWLER_NETWORK_NATIVE_CURRENCY_SYMBOL,
      nativeCurrencyDecimals: businessConfig.BITCOIN_CRAWLER_NETWORK_NATIVE_CURRENCY_DECIMALS,
      hasSegWit: businessConfig.BITCOIN_CRAWLER_NETWORK_HAS_SEGWIT,
      hasTaproot: businessConfig.BITCOIN_CRAWLER_NETWORK_HAS_TAPROOT,
      hasRBF: businessConfig.BITCOIN_CRAWLER_NETWORK_HAS_RBF,
      hasCSV: businessConfig.BITCOIN_CRAWLER_NETWORK_HAS_CSV,
      hasCLTV: businessConfig.BITCOIN_CRAWLER_NETWORK_HAS_CLTV,
      maxBlockSize: businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_SIZE,
      maxBlockWeight: businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT,
      difficultyAdjustmentInterval: businessConfig.BITCOIN_CRAWLER_NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL,
      targetBlockTime: businessConfig.BITCOIN_CRAWLER_NETWORK_TARGET_BLOCK_TIME,
    };

    const rateLimits: RateLimits = {
      maxConcurrentRequests: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS,
      maxBatchSize: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE,
      requestDelayMs: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS,
    };

    return {
      module: AppModule,
      controllers: [],
      imports: [
        LoggerModule.forRoot({ componentName: appName }),
        // Set main modules as global
        CqrsTransportModule.forRoot({ isGlobal: true }),
        CqrsModule.forRoot({ isGlobal: true }),
        TransportModule.forRoot({ isGlobal: true, transports }),
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network,
          rateLimits,
          providers: [
            {
              connection: {
                type: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_TYPE as NodeProviderTypes,
                baseUrl: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_NODE_HTTP_URL,
                responseTimeout: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_REQUEST_TIMEOUT,
              },
            },
          ],
        }),
        EventStoreModule.forRootAsync({
          name: EVENTSTORE_NAME,
          aggregates: [...userModels, networkModel],
          logging: eventstoreConfig.isLogging(),
          snapshotInterval: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_SNAPSHOT_INTERVAL,
          sqliteBatchSize: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_INSERT_BATCH_SIZE,
          type: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_TYPE,
          database: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_NAME,
          ...(eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_HOST && {
            host: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_HOST,
          }),
          ...(eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_PORT && {
            port: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_PORT,
          }),
          ...(eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_USERNAME && {
            username: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_USERNAME,
          }),
          ...(eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_PASSWORD && {
            password: eventstoreConfig.BITCOIN_CRAWLER_EVENTSTORE_DB_PASSWORD,
          }),
        }),
        BlocksQueueModule.forRootAsync({
          blocksCommandExecutor: NetworkCommandFactoryService,
          maxBlockHeight: businessConfig.BITCOIN_CRAWLER_MAX_BLOCK_HEIGHT,
          queueLoaderStrategyName: blocksQueueConfig.BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_STRATEGY_NAME,
          basePreloadCount: blocksQueueConfig.BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT,
          blockSize: businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT,
          queueLoaderRequestBlocksBatchSize,
          queueIteratorBlocksBatchSize,
          maxQueueSize,
          minTransferSize,
        }),
      ],
      providers: [
        {
          provide: AppConfig,
          useValue: appConfig,
        },
        {
          provide: BusinessConfig,
          useValue: businessConfig,
        },
        {
          provide: BlocksQueueConfig,
          useValue: blocksQueueConfig,
        },
        {
          provide: EventStoreConfig,
          useValue: eventstoreConfig,
        },
        {
          provide: ProvidersConfig,
          useValue: providersConfig,
        },
        {
          provide: 'FrameworkModelsConstructors',
          useValue: Models,
        },
        {
          provide: 'FrameworModelFactory',
          useFactory: (eventStoreWriteRepository: EventStoreWriteRepository, eventPublisher: EventPublisher) =>
            new ModelFactoryService(eventStoreWriteRepository, eventPublisher),
          inject: [EventStoreWriteRepository, EventPublisher],
        },
        AppService,
        MetricsService,
        ArithmeticService,
        NetworkSaga,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        CqrsFactoryService,
        ConsolePromptService,
        ...CommandHandlers,
        ...EventsHandlers,
        ...QueryHandlers,
        ...UserQueryHandlers,
        ...UserEventHandlers,
      ],
      exports: [],
    };
  }
}
