import type { Walker } from './declarative';

function isAsyncIterable(x: any): x is AsyncIterable<any> {
  return x && typeof x[Symbol.asyncIterator] === 'function';
}

export const walkBTC: Walker = async (from, source, fn) => {
  if (!source) return;

  switch (from) {
    // -------- Block traversal --------
    case 'block': {
      await fn({ block: source });
      return;
    }
    case 'block.tx': {
      const block: any = source;
      for (const tx of block.tx) await fn({ block, tx });
      return;
    }
    case 'block.tx.vin': {
      const block: any = source;
      for (const tx of block.tx) for (const vin of (tx as any).vin) await fn({ block, tx, vin });
      return;
    }
    case 'block.tx.vout': {
      const block: any = source;
      for (const tx of block.tx) for (const vout of (tx as any).vout) await fn({ block, tx, vout });
      return;
    }

    // -------- Mempool traversal --------
    case 'mempool': {
      await fn({ mempool: source });
      return;
    }

    case 'mempool.tx': {
      const mempool: any = source;

      // 1) snapshot { tx: any[] }
      if (Array.isArray(mempool?.tx)) {
        for (const tx of mempool.tx) await fn({ mempool, tx });
        return;
      }

      // 2) service: iterLoadedTx()
      if (typeof mempool?.iterLoadedTx === 'function') {
        const iter = mempool.iterLoadedTx();
        if (isAsyncIterable(iter)) {
          for await (const tx of iter) await fn({ mempool, tx });
          return;
        }
      }

      // 3) service: forEachLoadedTx(cb)
      if (typeof mempool?.forEachLoadedTx === 'function') {
        await mempool.forEachLoadedTx(async (tx: any) => {
          await fn({ mempool, tx });
        });
        return;
      }

      throw new Error('mempool.tx: unsupported mempool source.');
    }

    case 'mempool.tx.vin': {
      const mempool: any = source;
      const feed = async (tx: any) => {
        for (const vin of tx?.vin ?? []) await fn({ mempool, tx, vin });
      };

      if (Array.isArray(mempool?.tx)) {
        for (const tx of mempool.tx) await feed(tx);
        return;
      }
      if (typeof mempool?.iterLoadedTx === 'function') {
        for await (const tx of mempool.iterLoadedTx()) await feed(tx);
        return;
      }
      if (typeof mempool?.forEachLoadedTx === 'function') {
        await mempool.forEachLoadedTx(feed);
        return;
      }
      if (typeof mempool?.forEachTxLazy === 'function') {
        await mempool.forEachTxLazy(feed);
        return;
      }

      throw new Error('mempool.tx.vin: unsupported mempool source.');
    }

    case 'mempool.tx.vout': {
      const mempool: any = source;
      const feed = async (tx: any) => {
        for (const vout of tx?.vout ?? []) await fn({ mempool, tx, vout });
      };

      if (Array.isArray(mempool?.tx)) {
        for (const tx of mempool.tx) await feed(tx);
        return;
      }
      if (typeof mempool?.iterLoadedTx === 'function') {
        for await (const tx of mempool.iterLoadedTx()) await feed(tx);
        return;
      }
      if (typeof mempool?.forEachLoadedTx === 'function') {
        await mempool.forEachLoadedTx(feed);
        return;
      }
      if (typeof mempool?.forEachTxLazy === 'function') {
        await mempool.forEachTxLazy(feed);
        return;
      }

      throw new Error('mempool.tx.vout: unsupported mempool source.');
    }

    default:
      return;
  }
};
