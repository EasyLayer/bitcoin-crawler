import { Global, Module, DynamicModule, Provider } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { ArithmeticService } from '@easylayer/common/arithmetic';
import { EventStoreModule, EventStoreService } from '@easylayer/common/eventstore';
import { NetworkTransportModule } from '@easylayer/common/network-transport';
import {
  Network,
  Mempool,
  BlockchainProviderModule,
  BlocksQueueModule,
  NetworkConfig,
  RateLimits,
} from '@easylayer/bitcoin';
import { AppService } from './app.service';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  CqrsFactoryService,
  MempoolCommandFactoryService,
} from './application-layer/services';
import {
  NetworkModelFactoryService,
  ConsolePromptService,
  MempoolModelFactoryService,
  NETWORK_AGGREGATE_ID,
  MEMPOOL_AGGREGATE_ID,
} from './domain-layer/services';
import { AppConfig, BusinessConfig, EventStoreConfig, BlocksQueueConfig, ProvidersConfig } from './config';
import { ModelInput } from '@easylayer/common/framework';
import { MetricsService } from './metrics.service';
import { ModelFactoryService, normalizeModelsBTC } from './domain-layer/framework';

export interface AppModuleOptions {
  appName: string;
  Models?: ModelInput[];
  Providers?: Array<new (...args: any[]) => Provider>;
}

@Global()
@Module({})
export class AppModule {
  static async forRootAsync({ appName, Models = [], Providers = [] }: AppModuleOptions): Promise<DynamicModule> {
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

    const queueIteratorBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 10;

    // This models will not be used, only for run event store
    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0, blockHeight: -1 });
    const mempoolModel = new Mempool({ aggregateId: MEMPOOL_AGGREGATE_ID, blockHeight: -1 });

    // Create instances of models without merging for basic instances
    const NormalizedModels = normalizeModelsBTC(Models);
    const userModels = NormalizedModels.map((ModelCtr) => new ModelCtr());

    // Smart transport detection using helper methods
    const transports = appConfig.getEnabledTransports();

    // Network configuration
    const network: NetworkConfig = {
      network: businessConfig.NETWORK_TYPE as NetworkConfig['network'],
      nativeCurrencySymbol: businessConfig.NETWORK_NATIVE_CURRENCY_SYMBOL,
      nativeCurrencyDecimals: businessConfig.NETWORK_NATIVE_CURRENCY_DECIMALS,
      hasSegWit: businessConfig.NETWORK_HAS_SEGWIT,
      hasTaproot: businessConfig.NETWORK_HAS_TAPROOT,
      hasRBF: businessConfig.NETWORK_HAS_RBF,
      hasCSV: businessConfig.NETWORK_HAS_CSV,
      hasCLTV: businessConfig.NETWORK_HAS_CLTV,
      maxBlockSize: businessConfig.NETWORK_MAX_BLOCK_SIZE,
      maxBlockWeight: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
      difficultyAdjustmentInterval: businessConfig.NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL,
      targetBlockTime: businessConfig.NETWORK_TARGET_BLOCK_TIME,
    };

    const rateLimits: RateLimits = {
      maxConcurrentRequests: providersConfig.PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS,
      maxBatchSize: providersConfig.PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE,
      requestDelayMs: providersConfig.PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS,
    };

    const networkConnections: any = providersConfig.PROVIDER_NETWORK_RPC_URLS?.map((item) => ({
      baseUrl: item,
    }));

    const mempoolConnections: any = providersConfig.PROVIDER_MEMPOOL_RPC_URLS?.map((item) => ({
      baseUrl: item,
    }));

    return {
      module: AppModule,
      controllers: [],
      imports: [
        // Set main modules as global
        CqrsTransportModule.forRoot({ isGlobal: true, systemAggregates: [NETWORK_AGGREGATE_ID, MEMPOOL_AGGREGATE_ID] }),
        NetworkTransportModule.forRoot({ isGlobal: true, transports }),
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network,
          rateLimits,
          networkProviders: {
            type: providersConfig.NETWORK_PROVIDER_TYPE,
            connections: networkConnections,
          },
          mempoolProviders: {
            type: providersConfig.MEMPOOL_PROVIDER_TYPE,
            connections: mempoolConnections,
          },
        }),
        EventStoreModule.forRootAsync({
          isGlobal: true,
          name: `${appName}-eventstore`,
          aggregates: [...userModels, networkModel, mempoolModel],
          logging: eventstoreConfig.isLogging(),
          type: eventstoreConfig.EVENTSTORE_DB_TYPE,
          database: eventstoreConfig.EVENTSTORE_DB_NAME,
          ...(eventstoreConfig.EVENTSTORE_DB_HOST && {
            host: eventstoreConfig.EVENTSTORE_DB_HOST,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_PORT && {
            port: eventstoreConfig.EVENTSTORE_DB_PORT,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_USERNAME && {
            username: eventstoreConfig.EVENTSTORE_DB_USERNAME,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_PASSWORD && {
            password: eventstoreConfig.EVENTSTORE_DB_PASSWORD,
          }),
          // PostgreSQL pool settings
          ...(eventstoreConfig.EVENTSTORE_PG_POOL_MAX && {
            extra: {
              min: eventstoreConfig.EVENTSTORE_PG_POOL_MIN,
              max: eventstoreConfig.EVENTSTORE_PG_POOL_MAX,
            },
          }),
          ...(eventstoreConfig.EVENTSTORE_PG_QUERY_TIMEOUT && {
            maxQueryExecutionTime: eventstoreConfig.EVENTSTORE_PG_QUERY_TIMEOUT,
          }),
          ...(eventstoreConfig.EVENTSTORE_PG_IDLE_TIMEOUT &&
            ({
              extra: {
                idleTimeoutMillis: eventstoreConfig.EVENTSTORE_PG_IDLE_TIMEOUT,
                ...(eventstoreConfig.EVENTSTORE_PG_CONNECTION_TIMEOUT && {
                  connectionTimeoutMillis: eventstoreConfig.EVENTSTORE_PG_CONNECTION_TIMEOUT,
                }),
              },
            } as any)),
        }),
        BlocksQueueModule.forRootAsync({
          blocksCommandExecutor: NetworkCommandFactoryService,
          maxBlockHeight: businessConfig.MAX_BLOCK_HEIGHT,
          queueLoaderStrategyName: blocksQueueConfig.BLOCKS_QUEUE_LOADER_STRATEGY_NAME,
          basePreloadCount: blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT,
          blockSize: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
          queueLoaderRequestBlocksBatchSize,
          queueIteratorBlocksBatchSize,
          maxQueueSize,
          blockTimeMs: businessConfig.NETWORK_TARGET_BLOCK_TIME,
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
          useValue: NormalizedModels,
        },
        {
          provide: ModelFactoryService,
          useFactory: (eventStoreService: EventStoreService) => new ModelFactoryService(eventStoreService),
          inject: [EventStoreService],
        },
        AppService,
        MetricsService,
        ArithmeticService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        CqrsFactoryService,
        ConsolePromptService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        ...Providers,
      ],
      exports: [
        AppService,
        MetricsService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        CqrsFactoryService,
        ConsolePromptService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        AppConfig,
        BusinessConfig,
        EventStoreConfig,
        BlocksQueueConfig,
        ProvidersConfig,
        'FrameworkModelsConstructors',
        ModelFactoryService,
        BlocksQueueModule,
        EventStoreModule,
        ...Providers,
      ],
    };
  }
}
