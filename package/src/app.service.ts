import { v4 as uuidv4 } from 'uuid';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '@easylayer/common/logger';
import { NetworkCommandFactoryService } from './application-layer/services';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly log: AppLogger,
    private readonly networkCommandFactory: NetworkCommandFactoryService
  ) {}

  async onModuleInit() {
    await this.networkInitialization();
  }

  private async networkInitialization(): Promise<void> {
    // Init Network
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
