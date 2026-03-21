import { Global, Module, DynamicModule, Provider } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { ArithmeticService } from '@easylayer/common/arithmetic';
// In browser builds the bundler resolves these to their browser implementations:
//   @easylayer/common/eventstore  → browser/eventstore.browser.module (sql.js + IndexedDB)
//   @easylayer/common/network-transport → browser/transport.module (http-browser, ws-browser, electron-ipc-renderer)
//   @easylayer/bitcoin            → browser/blockchain-provider (fetch-based RPC, no P2P)
import { EventStoreModule, EventStoreReadService } from '@easylayer/common/eventstore';
import { NetworkTransportModule } from '@easylayer/common/network-transport';
import { Network, Mempool, BlockchainProviderModule, BlocksQueueModule } from '@easylayer/bitcoin';
import { AppService } from '../app.service';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  MempoolCommandFactoryService,
} from '../application-layer/services';
import {
  NetworkModelFactoryService,
  MempoolModelFactoryService,
  MempoolReadService,
  NetworkReadService,
  NETWORK_AGGREGATE_ID,
  MEMPOOL_AGGREGATE_ID,
} from '../domain-layer/services';
import {
  AppConfig,
  BusinessConfig,
  EventStoreConfig,
  BlocksQueueConfig,
  ProvidersConfig,
  BootstrapConfig,
} from '../config';
import { TransportConfig } from './config';
import { getUnifiedEnv } from '../config/unified-env';
import { ModelFactoryService, normalizeModelsBTC, ModelInput } from '../domain-layer/framework';
import { ConsolePromptService } from './console-prompt.service';

export interface BrowserAppModuleOptions {
  appName: string;
  Models?: ModelInput[];
  Providers?: Array<new (...args: any[]) => Provider>;
  config?: BootstrapConfig;
}

@Global()
@Module({})
export class BrowserAppModule {
  static async forRootAsync({
    appName,
    Models = [],
    Providers = [],
    config = {},
  }: BrowserAppModuleOptions): Promise<DynamicModule> {
    // Read from window.__ENV (with process.env fallback for Electron renderer)
    const env = getUnifiedEnv();

    const eventstoreConfig = await transformAndValidate(EventStoreConfig, env, {
      validator: { whitelist: true },
    });
    const appConfig = await transformAndValidate(AppConfig, env, {
      validator: { whitelist: true },
    });
    const businessConfig = await transformAndValidate(BusinessConfig, env, {
      validator: { whitelist: true },
    });
    const blocksQueueConfig = await transformAndValidate(BlocksQueueConfig, env, {
      validator: { whitelist: true },
    });
    const providersConfig = await transformAndValidate(ProvidersConfig, env, {
      validator: { whitelist: true },
    });
    const transportConfig = await transformAndValidate(TransportConfig, env, {
      validator: { whitelist: true },
    });

    const queueIteratorBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 10;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0, blockHeight: -1 });
    const mempoolModel = new Mempool({ aggregateId: MEMPOOL_AGGREGATE_ID, blockHeight: -1 });

    const NormalizedModels = normalizeModelsBTC(Models);
    const userModels = NormalizedModels.map((ModelCtr) => new ModelCtr());

    // Browser only supports RPC (no P2P, no ZMQ)
    const networkConnections: any = (providersConfig.PROVIDER_NETWORK_RPC_URLS ?? []).map((item) => ({
      baseUrl: item,
    }));
    const mempoolConnections: any = (providersConfig.PROVIDER_MEMPOOL_RPC_URLS ?? []).map((item) => ({
      baseUrl: item,
    }));

    return {
      module: BrowserAppModule,
      controllers: [],
      imports: [
        CqrsTransportModule.forRoot({
          isGlobal: true,
          systemAggregates: [NETWORK_AGGREGATE_ID, MEMPOOL_AGGREGATE_ID],
        }),

        // Browser NetworkTransportModule accepts only client-side transports:
        //   { type: 'http', webhook: { url, ... } }
        //   { type: 'ws', url: 'ws://...' }
        //   { type: 'electron-ipc-renderer' }
        NetworkTransportModule.forRoot({
          isGlobal: true,
          transports: transportConfig.getEnabledBrowserTransports(),
          outbox: transportConfig.getOutboxOptions(),
        }),

        // Browser BlockchainProviderModule uses fetch-based RPC (no P2P/ZMQ)
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network: businessConfig.getNetworkConfig(),
          rateLimits: providersConfig.getRateLimits(),
          networkProviders: {
            type: 'rpc', // browser always uses RPC
            connections: networkConnections,
          },
          mempoolProviders: {
            type: 'rpc',
            connections: mempoolConnections,
          },
        }),

        // Browser EventStoreModule uses sql.js backed by IndexedDB (localforage)
        // The `type: 'sqljs'` option is required; EVENTSTORE_DB_NAME becomes the
        // IndexedDB key / localforage store name.
        (EventStoreModule as any).forRootAsync({
          isGlobal: true,
          name: `${appName}-eventstore`,
          type: 'sqljs',
          database: eventstoreConfig.EVENTSTORE_DB_NAME,
          aggregates: [...userModels, networkModel, mempoolModel],
          logging: eventstoreConfig.isLogging(),
        }),

        BlocksQueueModule.forRootAsync({
          mempoolCommandExecutor: MempoolCommandFactoryService,
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
        { provide: AppConfig, useValue: appConfig },
        { provide: BusinessConfig, useValue: businessConfig },
        { provide: BlocksQueueConfig, useValue: blocksQueueConfig },
        { provide: EventStoreConfig, useValue: eventstoreConfig },
        { provide: ProvidersConfig, useValue: providersConfig },
        { provide: TransportConfig, useValue: transportConfig },
        { provide: 'BootstrapConfig', useValue: config },
        { provide: 'FrameworkModelsConstructors', useValue: NormalizedModels },
        { provide: 'ConsolePromptService', useClass: ConsolePromptService },
        {
          provide: ModelFactoryService,
          useFactory: (eventStoreService: EventStoreReadService) =>
            new ModelFactoryService(businessConfig, eventStoreService),
          inject: [EventStoreReadService],
        },
        AppService,
        ArithmeticService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        MempoolReadService,
        NetworkReadService,
        ...Providers,
      ],
      exports: [
        AppService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        AppConfig,
        BusinessConfig,
        EventStoreConfig,
        BlocksQueueConfig,
        ProvidersConfig,
        'FrameworkModelsConstructors',
        'BootstrapConfig',
        'ConsolePromptService',
        ModelFactoryService,
        BlocksQueueModule,
        EventStoreModule,
        MempoolReadService,
        NetworkReadService,
        ...Providers,
      ],
    };
  }
}
