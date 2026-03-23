import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { CheckMempoolTransactionFullQuery } from '@easylayer/bitcoin';
import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';
import { MempoolModelFactoryService, MempoolReadService } from '../../services';

export interface CheckMempoolTransactionFullResult {
  txid: string;
  exists: boolean;
  isLoaded: boolean;
  feeRate?: number;
  metadata?: MempoolTxMetadata;
  transaction?: LightTransaction;
}

@Injectable()
@QueryHandler(CheckMempoolTransactionFullQuery)
export class CheckMempoolTransactionFullHandler
  implements IQueryHandler<CheckMempoolTransactionFullQuery, CheckMempoolTransactionFullResult>
{
  constructor(
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly mempoolReadService: MempoolReadService
  ) {}

  async execute({ payload }: CheckMempoolTransactionFullQuery): Promise<CheckMempoolTransactionFullResult> {
    const { txid, includeMetadata = false, includeTransaction = true } = payload;
    const mempool = await this.mempoolModelFactory.initModel();

    const exists = mempool.hasTransaction(txid);
    const isLoaded = mempool.isTransactionLoaded(txid);

    const metadata = includeMetadata ? mempool.getTransactionMetadata(txid) : undefined;
    const transaction = includeTransaction ? mempool.getFullTransaction(txid) : undefined;

    const feeRate =
      transaction && typeof transaction.feeRate === 'number' && Number.isFinite(transaction.feeRate)
        ? transaction.feeRate
        : this.mempoolReadService.feeRateFromMetadata(metadata);

    return {
      txid,
      exists,
      isLoaded,
      feeRate,
      metadata,
      transaction,
    };
  }
}
