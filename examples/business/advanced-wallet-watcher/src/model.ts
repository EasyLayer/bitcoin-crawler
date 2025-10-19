import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type Block, type NetworkConfig } from '@easylayer/bitcoin';

const ADDRESSES = ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'];

type UtxoKey = `${string}_${number}`;

type ParsedTx = {
  txid: string;
  touches: string[];
  inputs: { txid: string; n: number; sequence?: number }[];
  outputs: { address: string; n: number; value: string }[];
  signaledRbf: boolean;
};

type SeenTx = {
  txid: string;
  touches: string[];
  inputs: { txid: string; n: number; sequence?: number }[];
  signaledRbf: boolean;
  firstSeenSource: 'mempool' | 'block';
  firstSeenAtHeight: number;
  confirmed?: { height: number; blockHash: string; index: number };
};

export class AdvancedWalletWatcher extends Model {
  static override modelId: string = 'my-model-name';

  private readonly watch = new Set<string>(ADDRESSES);

  private seenTx = new Map<string, SeenTx>();
  private outpointToTx = new Map<UtxoKey, string>();
  private lastMempoolTxCount = -1;

  public async processBlock(
    ctx: any & { block: Block; networkConfig?: NetworkConfig; mempool?: any }
  ): Promise<void> {
    const block = ctx.block; if (!block) return;
    const { tx = [], height, hash } = block;
    const net = (ctx as any).networkConfig?.network as NetworkConfig['network'] | undefined;

    if (ctx.mempool) await this.observeMempool(ctx.mempool, height, net);

    for (let index = 0; index < tx.length; index++) {
      const t = tx[index];
      const parsed = this.parseTxGeneric(t, net);
      if (!parsed) continue;

      if (!this.seenTx.has(parsed.txid)) {
        this.applyEvent('TxSeen', height, {
          txid: parsed.txid,
          touches: parsed.touches,
          inputs: parsed.inputs,
          outputs: parsed.outputs,
          signaledRbf: parsed.signaledRbf,
          source: 'block',
        });
      }

      this.applyEvent('TxConfirmed', height, {
        txid: parsed.txid,
        height,
        blockHash: hash,
        index,
      });

      if (parsed.touches.length) {
        for (const i of parsed.inputs) {
          const op: UtxoKey = `${i.txid}_${i.n}`;
          const prevTx = this.outpointToTx.get(op);
          if (prevTx && prevTx !== parsed.txid) {
            const prev = this.seenTx.get(prevTx);
            if (prev?.signaledRbf) {
              this.applyEvent('TxReplacedByRbf', height, {
                replacedTxid: prevTx,
                replacementTxid: parsed.txid,
                outpoint: op,
                winner: 'block',
              });
            }
            this.applyEvent('DoubleSpendDetected', height, {
              outpoint: op,
              txids: [prevTx, parsed.txid],
              scope: 'block_conflict',
            });
          }
        }
      }
    }
  }

  // ===== Mempool read-only (expects verbose outputs available) =====
  private async observeMempool(mp: any, tipHeight: number, net?: NetworkConfig['network']) {
    const txids: string[] = await this.safeCall(() => mp.getCurrentTxids());
    if (!txids?.length) return;

    // Optional micro-guard to avoid full pass when obviously unchanged
    if (this.lastMempoolTxCount === txids.length && this.outpointToTx.size > 0) return;

    // Prefer a batch verbose method if you add it; otherwise per-tx fallback.
    // Expected shape for each tx.vout: scriptPubKey.addresses[] OR scriptPubKey.hex.
    const getVerboseBatch = typeof mp.getVerboseTransactions === 'function'
      ? (ids: string[]) => mp.getVerboseTransactions(ids) // you add this (recommended)
      : null;

    const BATCH = 500;
    const outConflicts = new Map<UtxoKey, string[]>();

    for (let i = 0; i < txids.length; i += BATCH) {
      const slice = txids.slice(i, i + BATCH);

      let raws: any[] | undefined;
      if (getVerboseBatch) {
        raws = await this.safeCall(() => getVerboseBatch!(slice));
      } else {
        // fallback: single calls; still must return vout with addresses or hex
        raws = [];
        for (const id of slice) {
          const full = await this.safeCall(() => mp.getFullTransaction(id));
          if (full) raws.push(full);
          else {
            const meta = await this.safeCall(() => mp.getTransactionMetadata(id));
            if (meta) raws.push(meta);
          }
        }
      }
      if (!raws) continue;

      for (const raw of raws) {
        const parsed = this.parseTxGeneric(raw, net);
        if (!parsed) continue;

        if (!this.seenTx.has(parsed.txid)) {
          this.applyEvent('TxSeen', tipHeight, {
            txid: parsed.txid,
            touches: parsed.touches,
            inputs: parsed.inputs,
            outputs: parsed.outputs,
            signaledRbf: parsed.signaledRbf,
            source: 'mempool',
          });
        }

        if (parsed.touches.length) {
          for (const ii of parsed.inputs) {
            const op: UtxoKey = `${ii.txid}_${ii.n}`;
            const arr = outConflicts.get(op) ?? [];
            arr.push(parsed.txid);
            outConflicts.set(op, arr);
          }
        }
      }
    }

    this.outpointToTx.clear();
    for (const [op, list] of outConflicts) {
      const uniq = Array.from(new Set(list));
      if (uniq.length > 1) {
        this.applyEvent('DoubleSpendDetected', tipHeight, {
          outpoint: op,
          txids: uniq,
          scope: 'mempool',
        });
      }
      this.outpointToTx.set(op, uniq[uniq.length - 1]!);
    }

    this.lastMempoolTxCount = txids.length;
  }

  // ===== TX parsing (requires addresses[] or hex in outputs) =====
  private parseTxGeneric(rawTx: any, net?: NetworkConfig['network']): ParsedTx | null {
    const { txid, vin = [], vout = [] } = rawTx ?? {};
    if (!txid) return null;

    const touches: string[] = [];
    const outputs: { address: string; n: number; value: string }[] = [];
    const inputs: { txid: string; n: number; sequence?: number }[] = [];
    let signaledRbf = false;

    for (const o of vout) {
      const addr = this.extractAddressFromVout(o, net);
      if (!addr) continue;
      outputs.push({ address: addr, n: o.n, value: this.toSatString(o.value) });
      if (this.watch.has(addr)) touches.push(addr);
    }

    for (const i of vin) {
      if (i?.coinbase) continue;
      if (i?.txid == null || i?.vout == null) continue;
      inputs.push({ txid: i.txid, n: i.vout, sequence: i.sequence });
      if (typeof i.sequence === 'number' && i.sequence < 0xfffffffe) signaledRbf = true;
    }

    if (!touches.length) return null;
    return { txid, touches: Array.from(new Set(touches)), inputs, outputs, signaledRbf };
  }

  // ===== Reducers =====
  protected onTxSeen(e: any) {
    const p = e.payload as {
      txid: string;
      touches: string[];
      inputs: { txid: string; n: number; sequence?: number }[];
      outputs: { address: string; n: number; value: string }[];
      signaledRbf: boolean;
      source: 'mempool' | 'block';
    };

    const prev = this.seenTx.get(p.txid);
    if (!prev) {
      this.seenTx.set(p.txid, {
        txid: p.txid,
        touches: p.touches,
        inputs: p.inputs,
        signaledRbf: p.signaledRbf,
        firstSeenSource: p.source,
        firstSeenAtHeight: e.blockHeight ?? -1,
      });
    } else {
      if (p.touches.length) prev.touches = Array.from(new Set([...prev.touches, ...p.touches]));
      prev.signaledRbf = prev.signaledRbf || p.signaledRbf;
    }

    if (p.touches.length) {
      for (const i of p.inputs) {
        const op: UtxoKey = `${i.txid}_${i.n}`;
        this.outpointToTx.set(op, p.txid);
      }
    }
  }

  protected onTxConfirmed(e: any) {
    const p = e.payload as { txid: string; height: number; blockHash: string; index: number };
    const st = this.seenTx.get(p.txid);
    if (st) {
      st.confirmed = { height: p.height, blockHash: p.blockHash, index: p.index };
    } else {
      this.seenTx.set(p.txid, {
        txid: p.txid,
        touches: [],
        inputs: [],
        signaledRbf: false,
        firstSeenSource: 'block',
        firstSeenAtHeight: p.height,
        confirmed: { height: p.height, blockHash: p.blockHash, index: p.index },
      });
    }
  }

  protected onTxReplacedByRbf(_e: any) {}
  protected onDoubleSpendDetected(_e: any) {}

  // ===== Read helpers for queries =====
  public getTxStatus(txid: string) {
    const s = this.seenTx.get(txid);
    if (!s) return null;
    return {
      txid: s.txid,
      firstSeenSource: s.firstSeenSource,
      firstSeenAtHeight: s.firstSeenAtHeight,
      signaledRbf: s.signaledRbf,
      confirmed: s.confirmed ?? null,
      touches: s.touches,
    };
  }

  public getAddressSeen(address: string) {
    const arr: { txid: string; confirmed: boolean }[] = [];
    for (const s of this.seenTx.values()) {
      if (s.touches.includes(address)) arr.push({ txid: s.txid, confirmed: !!s.confirmed });
    }
    return arr;
  }

  public getAllAddressesSeen() {
    const res: Record<string, { txid: string; confirmed: boolean }[]> = {};
    for (const a of this.watch) res[a] = [];
    for (const s of this.seenTx.values()) {
      for (const a of s.touches) {
        const list = res[a] ?? [];
        list.push({ txid: s.txid, confirmed: !!s.confirmed });
        res[a] = list;
      }
    }
    return res;
  }

  // ===== Utilities =====
  private extractAddressFromVout(vout: any, net?: NetworkConfig['network']): string | undefined {
    try {
      if (vout?.scriptPubKey?.addresses?.length) return vout.scriptPubKey.addresses[0];
      if (vout?.scriptPubKey?.hex && net) {
        return ScriptUtilService.getScriptHashFromScriptPubKey(vout.scriptPubKey, net) || undefined;
      }
      return undefined;
    } catch { return undefined; }
  }

  private toSatString(v: unknown): string {
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '0';
    const [int, frac = ''] = s.split('.');
    const f = (frac + '00000000').slice(0, 8);
    return (BigInt(int || '0') * 100000000n + BigInt(f)).toString();
  }

  private async safeCall<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
    try { return await fn(); } catch { return undefined; }
  }
}
