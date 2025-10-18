import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { CheckMempoolTransactionFullQuery } from '@easylayer/bitcoin';
import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

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
  constructor(private readonly models: MempoolModelFactoryService) {}

  private feeRateFromMetadata(md?: MempoolTxMetadata): number | undefined {
    if (!md) return undefined;
    const v = Number(md.vsize);
    if (!Number.isFinite(v) || v <= 0) return undefined;

    const n =
      (typeof (md as any).modifiedfee === 'number' && (md as any).modifiedfee) ??
      (typeof (md as any).fee === 'number' && (md as any).fee) ??
      (typeof (md as any).fees?.modified === 'number' && (md as any).fees.modified) ??
      (typeof (md as any).fees?.base === 'number' && (md as any).fees.base) ??
      undefined;

    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
    return n / v;
  }

  async execute({ payload }: CheckMempoolTransactionFullQuery): Promise<CheckMempoolTransactionFullResult> {
    const { txid, includeMetadata = false, includeTransaction = true } = payload;
    const mempool = await this.models.initModel();

    const exists = mempool.hasTransaction(txid);
    const isLoaded = mempool.isTransactionLoaded(txid);

    const metadata = includeMetadata ? mempool.getTransactionMetadata(txid) : undefined;
    const transaction = includeTransaction ? mempool.getFullTransaction(txid) : undefined;

    const feeRate =
      transaction && typeof transaction.feeRate === 'number' && Number.isFinite(transaction.feeRate)
        ? transaction.feeRate
        : this.feeRateFromMetadata(metadata);

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
