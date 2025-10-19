// import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolSynchronizedEvent, MempoolLoaderService } from '@easylayer/bitcoin';

@Injectable()
@EventsHandler(BitcoinMempoolSynchronizedEvent)
export class BitcoinMempoolSynchronizedEventHandler implements IEventHandler<BitcoinMempoolSynchronizedEvent> {
  constructor(private readonly mempoolLoaderService: MempoolLoaderService) {}

  async handle(event: BitcoinMempoolSynchronizedEvent) {
    this.mempoolLoaderService.unlock();
  }
}
