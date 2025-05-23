import { Module, DynamicModule } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsModule, EventPublisher } from '@easylayer/common/cqrs';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { AppLogger, LoggerModule } from '@easylayer/common/logger';
import { ArithmeticService } from '@easylayer/common/arithmetic';
import { EventStoreModule, EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { NetworkTransportModule, TransportOptions } from '@easylayer/common/network-transport';
import { Network, BlockchainProviderModule, BlocksQueueModule } from '@easylayer/bitcoin';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NetworkSaga } from './application-layer/sagas';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  CqrsFactoryService,
} from './application-layer/services';
import { NetworkModelFactoryService, NETWORK_AGGREGATE_ID } from './domain-layer/services';
import { CommandHandlers } from './domain-layer/command-handlers';
import { EventsHandlers } from './domain-layer/events-handlers';
import { QueryHandlers } from './domain-layer/query-handlers';
import { AppConfig, BusinessConfig, EventStoreConfig, BlocksQueueConfig, ProvidersConfig } from './config';
import { ModelType, ModelFactoryService } from './framework';
import { MetricsService } from './metrics.service';

const appName = `${process?.env?.BITCOIN_CRAWLER_APPLICATION_NAME || 'bitcoin'}`; // TODO: think where to put this

export const EVENTSTORE_NAME = `${appName}-eventstore`;

interface AppModuleOptions {
  Models: ModelType[];
  ws?: boolean;
  tcp?: boolean;
  ipc?: boolean;
}

@Module({})
export class BitcoinAppModule {
  static async register({ Models, ws, tcp, ipc }: AppModuleOptions): Promise<DynamicModule> {
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

    const queueIteratorBlocksBatchSize = businessConfig.BITCOIN_CRAWLER_ONE_BLOCK_SIZE * 4; //50;
    const queueLoaderRequestBlocksBatchSize = businessConfig.BITCOIN_CRAWLER_ONE_BLOCK_SIZE * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 3;
    const minTransferSize = businessConfig.BITCOIN_CRAWLER_ONE_BLOCK_SIZE - 1;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0 });
    // IMPORTANT: We create instances of models not through the factory (without merging)
    // because we are allowed to get only basic instances here without publications
    const userModels = Models.map((ModelCtr) => new ModelCtr());

    const transports: TransportOptions[] = [];

    if (ws) {
      transports.push({ type: 'ws', port: appConfig.HTTP_PORT });
    }
    if (tcp) {
      transports.push({ type: 'tcp', host: appConfig.TCP_HOST, port: appConfig.TCP_PORT });
    }
    if (ipc) {
      transports.push({ type: 'ipc', isEnable: true });
    }

    return {
      module: BitcoinAppModule,
      controllers: [AppController],
      imports: [
        LoggerModule.forRoot({ componentName: appName }),
        // IMPORTANT: Set main modules as global;
        CqrsTransportModule.forRoot({ isGlobal: true }),
        CqrsModule.forRoot({ isGlobal: true }),
        NetworkTransportModule.forRoot({ isGlobal: true, transports }),
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          quickNodesUrls: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_QUICK_NODE_URLS,
          selfNodesUrl: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_SELF_NODE_URL,
          responseTimeout: providersConfig.BITCOIN_CRAWLER_NETWORK_PROVIDER_REQUEST_TIMEOUT,
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
          queueLoaderConcurrency: blocksQueueConfig.BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_CONCURRENCY_COUNT,
          basePreloadCount: blocksQueueConfig.BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT,
          blockSize: businessConfig.BITCOIN_CRAWLER_ONE_BLOCK_SIZE,
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
        ...CommandHandlers,
        ...EventsHandlers,
        ...QueryHandlers,
      ],
      exports: [],
    };
  }
}
