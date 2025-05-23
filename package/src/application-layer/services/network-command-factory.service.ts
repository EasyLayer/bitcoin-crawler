// import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import { InitNetworkCommand, AddBlocksBatchCommand } from '@easylayer/bitcoin';

@Injectable()
export class NetworkCommandFactoryService {
  constructor(private readonly commandBus: CommandBus) {}

  public async init(dto: any): Promise<void> {
    return await this.commandBus.execute(new InitNetworkCommand(dto));
  }

  public async handleBatch(dto: any): Promise<void> {
    await this.commandBus.execute(new AddBlocksBatchCommand({ ...dto }));
  }
}
