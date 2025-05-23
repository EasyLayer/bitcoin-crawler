import { v4 as uuidv4 } from 'uuid';
import type { EventBasePayload } from '@easylayer/bitcoin-crawler';
import { Model, BasicEvent } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'uniqAggregateId';

interface BlockAddedEventPayload extends EventBasePayload {
  block: any;
}

export class BlockAddedEvent extends BasicEvent<BlockAddedEventPayload> {}

export default class BlocksModel extends Model {
  blocks: Map<string, any> = new Map();

  constructor() {
    super(AGGREGATE_ID);
  }

  protected toJsonPayload(): any {
    return {
      // Turn Map into an array of objects of the form { hash, <block fields> }
      blocks: Array.from(this.blocks.entries()).map(([hash, block]) => ({
        hash,
        ...block,
      })),
    };
  }

  protected fromSnapshot(state: any): void {
    this.blocks = new Map<string, any>();

    if (Array.isArray(state.blocks)) {
      for (const block of state.blocks) {
        this.blocks.set(block.hash, block);
      }
    }

    // Restore the prototype so that the BlocksModel methods are in place again
    Object.setPrototypeOf(this, BlocksModel.prototype);
  }

  async parseBlock({ block }: { block: any }) {
    const { height } = block;

    await this.apply(
      new BlockAddedEvent({
        aggregateId: this.aggregateId,
        requestId: uuidv4(),
        blockHeight: +height,
        block,
      })
    );
  }

  private onBlockAddedEvent({ payload }: BlockAddedEvent) {
    const { block } = payload;

    if (!this.blocks.has(block.hash)) {
      this.blocks.set(block.hash, block);
    }
  }
}
