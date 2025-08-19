import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetMempoolTxidsQuery } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

@QueryHandler(GetMempoolTxidsQuery)
export class GetMempoolTxidsQueryHandler implements IQueryHandler<GetMempoolTxidsQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute({ payload }: GetMempoolTxidsQuery): Promise<any> {
    const { streaming = false, batchSize = 1000 } = payload;

    if (streaming) {
      return this.mempoolModelFactory.streamCurrentTxids(batchSize);
    } else {
      return {
        txids: await this.mempoolModelFactory.getCurrentTxids(),
      };
    }
  }
}
