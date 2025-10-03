import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export class BlockAddedEvent {
  constructor(public readonly hash: string) {}
}

type Store = Record<string, never>;

const BlocksModelDeclarative: DeclarativeModel<Store> = {
  modelId: AGGREGATE_ID,
  state: (): Store => ({}),

  sources: {
    async block({ block, applyEvent }: any): Promise<void> {
      if (!block) return;
      await applyEvent('BlockAddedEvent', block.height, { hash: block.hash });
    },
  },

  reducers: {
    BlockAddedEvent() {},
  },

  options: {
    snapshotsEnabled: false,
  },
};

const BlocksModel = compileStateModelBTC<Store>(BlocksModelDeclarative);
export default BlocksModel;
