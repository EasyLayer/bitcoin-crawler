import 'reflect-metadata';
import { compileStateModel, type Walker, type DeclarativeModel } from '../state-model-compiler';

// Custom walker isolated from walkBTC. We do not test walkBTC here.
const makeWalker =
  (txs: any[]): Walker =>
  async (from, source, fn) => {
    if (from === 'mempool.tx') {
      for (const tx of txs) {
        await fn({ tx, mempool: source });
      }
      return;
    }
    if (from === 'mempool') {
      await fn({ mempool: source });
      return;
    }
    // block-phase: nothing in these tests
  };

function makeBaseCtx(mempool: any) {
  return {
    mempool,
    network: {} as any,
    networkConfig: {} as any,
    services: {} as any,
  } as any;
}

describe('compileStateModel — mempoolTick', () => {
  it('calls sources.mempool exactly once per tick with ctx.mempool', async () => {
    const txs = [{ txid: 't1' }, { txid: 't2' }];
    const mempool = { __tag: 'fake-mempool-read-service' };
    const mempoolSpy = jest.fn();

    const decl: DeclarativeModel<{}> = {
      modelId: 'M1',
      state: () => ({}),
      sources: {
        mempool: mempoolSpy,
      },
    };
    const Compiled = compileStateModel(decl, makeWalker(txs));
    const instance = new Compiled();

    await (instance as any).mempoolTick(makeBaseCtx(mempool));

    expect(mempoolSpy).toHaveBeenCalledTimes(1);
    const ctx = mempoolSpy.mock.calls[0]![0];
    expect(ctx.mempool).toBe(mempool);
  });

  it('calls sources.mempoolTx for each tx', async () => {
    const txs = [{ txid: 't1' }, { txid: 't2' }, { txid: 't3' }];
    const mempool = { __tag: 'fake-mempool' };
    const txSpy = jest.fn();

    const decl: DeclarativeModel<{}> = {
      modelId: 'M2',
      state: () => ({}),
      sources: {
        mempoolTx: txSpy,
      },
    };
    const Compiled = compileStateModel(decl, makeWalker(txs));
    const instance = new Compiled();

    await (instance as any).mempoolTick(makeBaseCtx(mempool));

    expect(txSpy).toHaveBeenCalledTimes(3);
    expect(txSpy.mock.calls.map((c) => c[0].tx.txid)).toEqual(['t1', 't2', 't3']);
  });

  it('does NOT call block-phase handlers from mempoolTick', async () => {
    const txs = [{ txid: 't1' }];
    const blockSpy = jest.fn();
    const txSpy = jest.fn();
    const voutSpy = jest.fn();
    const vinSpy = jest.fn();

    const decl: DeclarativeModel<{}> = {
      modelId: 'M3',
      state: () => ({}),
      sources: {
        block: blockSpy,
        tx: txSpy,
        vout: voutSpy,
        vin: vinSpy,
      },
    };
    const Compiled = compileStateModel(decl, makeWalker(txs));
    const instance = new Compiled();

    await (instance as any).mempoolTick(makeBaseCtx({}));

    expect(blockSpy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
    expect(voutSpy).not.toHaveBeenCalled();
    expect(vinSpy).not.toHaveBeenCalled();
  });

  it('returns early when ctx.mempool is undefined', async () => {
    const mempoolSpy = jest.fn();
    const txSpy = jest.fn();
    const decl: DeclarativeModel<{}> = {
      modelId: 'M4',
      state: () => ({}),
      sources: { mempool: mempoolSpy, mempoolTx: txSpy },
    };
    const Compiled = compileStateModel(decl, makeWalker([]));
    const instance = new Compiled();

    await (instance as any).mempoolTick({ mempool: undefined } as any);

    expect(mempoolSpy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
  });

  it('appends sources.mempool returned values into locals.mempool', async () => {
    const mempool = {};
    let capturedLocals: any = null;
    const decl: DeclarativeModel<{}> = {
      modelId: 'M5',
      state: () => ({}),
      sources: {
        mempool: (ctx: any) => {
          capturedLocals = ctx.locals;
          return { kind: 'tick-result' };
        },
      },
    };
    const Compiled = compileStateModel(decl, makeWalker([]));
    const instance = new Compiled();

    await (instance as any).mempoolTick(makeBaseCtx(mempool));

    expect(capturedLocals).not.toBeNull();
    expect(capturedLocals.mempool).toEqual([{ kind: 'tick-result' }]);
    expect(capturedLocals.mempoolTx).toEqual([]);
  });

  it('appends sources.mempoolTx returned values into locals.mempoolTx', async () => {
    const txs = [{ txid: 'a' }, { txid: 'b' }];
    let lastLocals: any = null;
    const decl: DeclarativeModel<{}> = {
      modelId: 'M6',
      state: () => ({}),
      sources: {
        mempoolTx: (ctx: any) => {
          lastLocals = ctx.locals;
          return { tx: ctx.tx.txid };
        },
      },
    };
    const Compiled = compileStateModel(decl, makeWalker(txs));
    const instance = new Compiled();

    await (instance as any).mempoolTick(makeBaseCtx({}));

    expect(lastLocals).not.toBeNull();
    expect(lastLocals.mempoolTx).toEqual([{ tx: 'a' }, { tx: 'b' }]);
    expect(lastLocals.mempool).toEqual([]);
  });
});
