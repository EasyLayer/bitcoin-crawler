import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { CheckMempoolTransactionQuery, MempoolTransaction, Transaction } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(CheckMempoolTransactionQuery)
export class CheckMempoolTransactionQueryHandler implements IQueryHandler<CheckMempoolTransactionQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute({ payload }: CheckMempoolTransactionQuery): Promise<{
    txid: string;
    exists: boolean;
    isLoaded: boolean;
    metadata?: MempoolTransaction;
    fullTransaction?: Transaction;
    providers: string[];
  }> {
    const { txid } = payload;
    return await this.mempoolModelFactory.checkTransaction(txid);
  }
}
