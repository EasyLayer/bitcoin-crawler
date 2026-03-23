import { Model } from '@easylayer/bitcoin-crawler';
import type { ProcessBlockExecutionContext, MempoolTickExecutionContext } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type NetworkConfig } from '@easylayer/bitcoin';

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

  /**
   * Block path: emit confirmations for transactions that touch watched addresses.
   * No mempool scanning here; mempool is handled in mempoolTick().
   */
  public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
    const block = ctx.block; if (!block) return;
    const { tx = [], height, hash } = block;
    const net = ctx.networkConfig.network;

    for (let index = 0; index < tx.length; index++) {
      const t = tx[index];
      const parsed = this.parseTxGeneric(t, net);
      if (!parsed) continue;

      // First seen in block (rare but possible if mempool phase was skipped)
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

      // Confirmation event for any touching tx
      this.applyEvent('TxConfirmed', height, {
        txid: parsed.txid,
        height,
        blockHash: hash,
        index,
      });

      // Wallet-specific confirmation (separate from generic TxConfirmed)
      if (parsed.touches.length) {
        this.applyEvent('WalletCreditConfirmed', height, {
          txid: parsed.txid,
          addresses: parsed.touches,
          height,
          blockHash: hash,
          index,
        });
      }
    }
  }

  /**
   * Mempool path: stream transactions and emit WalletCreditSeen for new touches.
   * Uses provider streaming APIs; no full snapshot materialization.
   */
  public async mempoolTick(ctx: MempoolTickExecutionContext): Promise<void> {
    const mp = ctx.mempool;
    if (!mp) return;

    const net = ctx.networkConfig.network;
    const tipHeight = typeof mp.getLastHeight === 'function' ? await mp.getLastHeight() : -1;

    const sz = await mp.getMempoolSize();
    const cnt = sz?.transactionCount ?? sz?.txidCount ?? undefined;
    if (typeof cnt === 'number' && cnt >= 0) {
      if (this.lastMempoolTxCount === cnt && this.outpointToTx.size > 0) return;
      this.lastMempoolTxCount = cnt;
    }

    // Single-tx processing routine to avoid memory spikes
    const feedTx = async (tx: any) => {
      const parsed = this.parseTxGeneric(tx, net);
      if (!parsed) return;

      // Generic "first seen" (idempotent-safe)
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

      // Wallet-specific "credit observed" only if touches exist and delta detected
      if (parsed.touches.length) {
        const prev = this.seenTx.get(parsed.txid);
        const prevTouches = new Set(prev?.touches ?? []);
        const delta = parsed.touches.filter(a => !prevTouches.has(a));
        if (delta.length) {
          this.applyEvent('WalletCreditSeen', tipHeight, {
            txid: parsed.txid,
            addresses: delta,
            signaledRbf: parsed.signaledRbf,
          });
        }

        // Mempool-only conflict/RBF detection
        for (const ii of parsed.inputs) {
          const op: UtxoKey = `${ii.txid}_${ii.n}`;

          const prevTx = this.outpointToTx.get(op);
          if (prevTx && prevTx !== parsed.txid) {
            const prevSeen = this.seenTx.get(prevTx);
            if (prevSeen?.signaledRbf) {
              this.applyEvent('TxReplacedByRbf', tipHeight, {
                replacedTxid: prevTx,
                replacementTxid: parsed.txid,
                outpoint: op,
                winner: 'mempool',
              });
            }
            this.applyEvent('DoubleSpendDetected', tipHeight, {
              outpoint: op,
              txids: [prevTx, parsed.txid],
              scope: 'mempool',
            });
          }

          // Current tx becomes the latest user of the outpoint
          this.outpointToTx.set(op, parsed.txid);
        }
      }
    };

    // Preferred streaming APIs from the provider service
    if (typeof mp.forEachLoadedTx === 'function') {
      await mp.forEachLoadedTx(feedTx);
      return;
    }
    if (typeof mp.iterLoadedTx === 'function') {
      for await (const tx of mp.iterLoadedTx()) {
        await feedTx(tx);
      }
      return;
    }
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

  protected onWalletCreditSeen(_e: any) {
    // no-op reducer (events are observable via outbox); extend if you keep derived state
  }

  protected onWalletCreditConfirmed(_e: any) {
    // no-op reducer; extend if you keep derived state
  }

  protected onTxReplacedByRbf(_e: any) {}
  protected onDoubleSpendDetected(_e: any) {}

  // ===== Read helpers =====
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
}
