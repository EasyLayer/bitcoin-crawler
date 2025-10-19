import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolRefreshedEvent } from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolRefreshedEvent)
export class BitcoinMempoolRefreshedEventHandler implements IEventHandler<BitcoinMempoolRefreshedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle({ payload }: BitcoinMempoolRefreshedEvent) {
    await this.mempoolCommandFactory.sync({
      requestId: uuidv4(),
    });
  }
}
