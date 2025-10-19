// import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import { InitMempoolCommand, SyncMempoolCommand, RefreshMempoolCommand } from '@easylayer/bitcoin';
import type { MempoolCommandExecutor } from '@easylayer/bitcoin';

@Injectable()
export class MempoolCommandFactoryService implements MempoolCommandExecutor {
  constructor(private readonly commandBus: CommandBus) {}

  public async init(dto: any): Promise<void> {
    return await this.commandBus.execute(new InitMempoolCommand(dto));
  }

  public async handleSnapshot(dto: any): Promise<void> {
    await this.commandBus.execute(new RefreshMempoolCommand({ ...dto }));
  }

  public async sync(dto: any): Promise<void> {
    await this.commandBus.execute(new SyncMempoolCommand({ ...dto }));
  }
}
