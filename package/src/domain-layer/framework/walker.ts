import type { Walker } from '@easylayer/common/framework';

export const walkBTC: Walker = async (from, block, fn) => {
  if (!block) return;

  if (from === 'block') {
    await fn({ block });
    return;
  }

  const txs = (block as any)?.tx ?? [];
  if (from === 'block.tx') {
    for (const tx of txs) await fn({ block, tx });
    return;
  }

  if (from === 'block.tx.vin') {
    for (const tx of txs) {
      const vins = (tx as any)?.vin ?? [];
      for (const vin of vins) await fn({ block, tx, vin });
    }
    return;
  }

  if (from === 'block.tx.vout') {
    for (const tx of txs) {
      const vouts = (tx as any)?.vout ?? [];
      for (const vout of vouts) await fn({ block, tx, vout });
    }
    return;
  }
};
