// import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import {
  InitMempoolCommand,
  ProcessMempoolSyncCommand,
  ProcessMempoolBlocksBatchCommand,
  ProcessMempoolReorganisationCommand,
} from '@easylayer/bitcoin';

@Injectable()
export class MempoolCommandFactoryService {
  constructor(private readonly commandBus: CommandBus) {}

  public async init(dto: any): Promise<void> {
    return await this.commandBus.execute(new InitMempoolCommand(dto));
  }

  public async processSync(dto: any): Promise<void> {
    await this.commandBus.execute(new ProcessMempoolSyncCommand({ ...dto }));
  }

  public async processBlocksBatch(dto: any): Promise<void> {
    await this.commandBus.execute(new ProcessMempoolBlocksBatchCommand({ ...dto }));
  }

  public async processReorganisation(dto: any): Promise<void> {
    await this.commandBus.execute(new ProcessMempoolReorganisationCommand({ ...dto }));
  }
}
