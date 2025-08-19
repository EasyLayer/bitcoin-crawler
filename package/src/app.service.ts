import { v4 as uuidv4 } from 'uuid';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '@easylayer/common/logger';
import { NetworkCommandFactoryService, MempoolCommandFactoryService } from './application-layer/services';
import { ProvidersConfig } from './config';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly log: AppLogger,
    private readonly networkCommandFactory: NetworkCommandFactoryService,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService,
    private readonly providersConfig: ProvidersConfig
  ) {}

  async onModuleInit() {
    if (
      Array.isArray(this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS) &&
      this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS.length > 0
    ) {
      await this.mempoolInitialization();
    } else {
      await this.networkInitialization();
    }
  }

  private async networkInitialization(): Promise<void> {
    // Init Network
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }

  private async mempoolInitialization(): Promise<void> {
    // Init Mempool
    await this.mempoolCommandFactory.init({ requestId: uuidv4() });
  }
}
