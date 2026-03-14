import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Mempool } from '@easylayer/bitcoin';
import { BusinessConfig } from '../../config';

export const MEMPOOL_AGGREGATE_ID = 'mempool';

@Injectable()
export class MempoolModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Mempool>,
    private readonly businessConfig: BusinessConfig
  ) {}

  public createNewModel(): Mempool {
    return new Mempool({
      aggregateId: MEMPOOL_AGGREGATE_ID,
      minFeeRate: this.businessConfig.MEMPOOL_MIN_FEE_RATE,
      blockHeight: -1,
      options: {
        allowPruning: true,
        snapshotsEnabled: true,
        snapshotInterval: 6,
      },
    });
  }

  public async initModel(): Promise<Mempool> {
    return this.eventStoreService.getOne(this.createNewModel());
  }
}
