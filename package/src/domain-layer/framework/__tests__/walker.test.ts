import { walkBTC } from '../walker';

async function collect(from: string, source: any): Promise<any[]> {
  const out: any[] = [];
  await walkBTC(from, source, async (ctx) => {
    out.push(ctx);
  });
  return out;
}

describe('walkBTC — block phase', () => {
  const tx1 = { vin: [{ i: 0 }], vout: [{ o: 0 }, { o: 1 }] };
  const tx2 = { vin: [{ i: 1 }, { i: 2 }], vout: [{ o: 2 }] };
  const block = { hash: 'h', tx: [tx1, tx2] };

  it('block → invokes fn once with { block }', async () => {
    const out = await collect('block', block);
    expect(out).toEqual([{ block }]);
  });

  it('block.tx → invokes fn for each tx', async () => {
    const out = await collect('block.tx', block);
    expect(out).toEqual([
      { block, tx: tx1 },
      { block, tx: tx2 },
    ]);
  });

  it('block.tx.vin → invokes fn for each vin', async () => {
    const out = await collect('block.tx.vin', block);
    expect(out.length).toBe(3);
    expect(out[0]!.vin).toEqual({ i: 0 });
    expect(out[2]!.vin).toEqual({ i: 2 });
  });

  it('block.tx.vout → invokes fn for each vout', async () => {
    const out = await collect('block.tx.vout', block);
    expect(out.length).toBe(3);
  });
});

describe('walkBTC — mempool phase', () => {
  const txs = [
    { txid: 'a', vin: [{ i: 0 }], vout: [{ o: 0 }] },
    { txid: 'b', vin: [{ i: 1 }, { i: 2 }], vout: [{ o: 1 }, { o: 2 }] },
  ];

  it('mempool → invokes fn once with { mempool }', async () => {
    const out = await collect('mempool', { foo: 1 });
    expect(out).toEqual([{ mempool: { foo: 1 } }]);
  });

  describe('mempool.tx', () => {
    it('source.tx array path', async () => {
      const out = await collect('mempool.tx', { tx: txs });
      expect(out.map((c) => c.tx.txid)).toEqual(['a', 'b']);
    });

    it('source.iterLoadedTx async generator path', async () => {
      const source = {
        async *iterLoadedTx() {
          yield txs[0];
          yield txs[1];
        },
      };
      const out = await collect('mempool.tx', source);
      expect(out.map((c) => c.tx.txid)).toEqual(['a', 'b']);
    });

    it('source.forEachLoadedTx callback path', async () => {
      const source = {
        async forEachLoadedTx(cb: (tx: any) => Promise<void>) {
          for (const tx of txs) await cb(tx);
        },
      };
      const out = await collect('mempool.tx', source);
      expect(out.map((c) => c.tx.txid)).toEqual(['a', 'b']);
    });

    it('throws when mempool source supports none of the variants', async () => {
      await expect(collect('mempool.tx', { unknown: true })).rejects.toThrow(
        /mempool.tx: unsupported mempool source/
      );
    });
  });

  describe('mempool.tx.vin', () => {
    it('array path', async () => {
      const out = await collect('mempool.tx.vin', { tx: txs });
      expect(out.length).toBe(3);
    });

    it('throws when no source path matches', async () => {
      await expect(collect('mempool.tx.vin', { foo: 1 })).rejects.toThrow(
        /mempool.tx.vin: unsupported mempool source/
      );
    });
  });

  describe('mempool.tx.vout', () => {
    it('array path', async () => {
      const out = await collect('mempool.tx.vout', { tx: txs });
      expect(out.length).toBe(3);
    });

    it('throws when no source path matches', async () => {
      await expect(collect('mempool.tx.vout', { foo: 1 })).rejects.toThrow(
        /mempool.tx.vout: unsupported mempool source/
      );
    });
  });
});

describe('walkBTC — defaults', () => {
  it('returns silently when source is falsy', async () => {
    const out = await collect('block', null);
    expect(out).toEqual([]);
  });

  it('returns silently on unknown "from"', async () => {
    const out = await collect('totally.unknown', { whatever: 1 });
    expect(out).toEqual([]);
  });
});
