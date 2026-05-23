import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'MempoolMonitoringModel';

export class MempoolTickEvent {
  constructor(public readonly tickIndex: number) {}
}

export class MempoolTxSeenEvent {
  constructor(public readonly txid: string) {}
}

type Store = {
  ticks: number;
  txCount: number;
};

const MempoolMonitoringModelDeclarative: DeclarativeModel<Store> = {
  modelId: AGGREGATE_ID,
  state: (): Store => ({ ticks: 0, txCount: 0 }),

  sources: {
    async mempool({ state, applyEvent }: any): Promise<void> {
      // Called exactly once per mempool tick.
      await applyEvent('MempoolTickEvent', state.ticks, { tickIndex: state.ticks });
    },

    async mempoolTx({ state, tx, applyEvent }: any): Promise<void> {
      if (!tx || typeof tx.txid !== 'string') return;
      await applyEvent('MempoolTxSeenEvent', state.txCount, { txid: tx.txid });
    },
  },

  reducers: {
    MempoolTickEvent(state: Store) {
      state.ticks += 1;
    },
    MempoolTxSeenEvent(state: Store) {
      state.txCount += 1;
    },
  },

  options: {
    snapshotsEnabled: false,
  },
};

const MempoolMonitoringModel = compileStateModelBTC<Store>(MempoolMonitoringModelDeclarative);
export default MempoolMonitoringModel;
