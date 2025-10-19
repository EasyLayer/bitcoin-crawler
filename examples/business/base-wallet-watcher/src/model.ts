import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type Block, type NetworkConfig } from '@easylayer/bitcoin';
import { Money, type Currency } from '@easylayer/common/arithmetic';

const CURRENCY: Currency = { code: 'BTC', minorUnit: 8 };
const ADDRESSES = ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'];

type UtxoKey = `${string}_${number}`;
type OutputHit = { address: string; txid: string; n: number; value: string };
type InputRef = { txid: string; n: number };
type UtxoView = { txid: string; n: number; value: string };

export interface WalletState {
  address: string;
  balance: string;
  utxoCount: number;
  txids: string[];
  lastActivity: number;
}

export class BaseWalletWatcher extends Model {
  static override modelId: string = 'my-model-name';

  private readonly wallets: ReadonlySet<string> = new Set(ADDRESSES);

  public walletStates = new Map<string, WalletState>();
  public utxoLookup = new Map<UtxoKey, { address: string; value: string }>();
  public addressUtxos = new Map<string, UtxoKey[]>();
  public addressTxids = new Map<string, Set<string>>();

  public async processBlock(
    ctx: any & { block: Block; networkConfig?: NetworkConfig }
  ): Promise<void> {
    const block = ctx.block; if (!block) return;
    const { tx = [], height } = block;
    const net = (ctx as any).networkConfig?.network as NetworkConfig['network'] | undefined;

    const outputs: OutputHit[] = [];
    const inputs: InputRef[] = [];

    const seenOut = new Set<UtxoKey>();
    const seenIn  = new Set<UtxoKey>();

    for (const t of tx) {
      const { txid, vout = [], vin = [] } = t;

      for (const o of vout) {
        const addr = this.extractAddressFromVout(o, net);
        if (!addr || !this.wallets.has(addr)) continue;
        const key: UtxoKey = `${txid}_${o.n}`;
        if (seenOut.has(key)) continue;
        seenOut.add(key);
        const sat = Money.fromDecimal(o.value.toString(), CURRENCY).toCents().toString();
        outputs.push({ address: addr, txid, n: o.n, value: sat });
      }

      for (const i of vin) {
        if (i.coinbase) continue;
        if (i.txid === undefined || i.vout === undefined) continue;
        const key: UtxoKey = `${i.txid}_${i.vout}`;
        if (seenIn.has(key)) continue;
        seenIn.add(key);
        inputs.push({ txid: i.txid, n: i.vout });
      }
    }

    if (outputs.length) this.applyEvent('WalletCredited', height, { outputs });
    if (inputs.length) this.applyEvent('WalletDebited', height, { inputs });
  }

  protected onWalletCredited(e: any): void {
    const { outputs } = e.payload as { outputs: OutputHit[] };
    const bh = e.blockHeight as number;

    for (const out of outputs) {
      const addr = out.address;

      let st = this.walletStates.get(addr);
      if (!st) {
        st = { address: addr, balance: '0', utxoCount: 0, txids: [], lastActivity: bh };
        this.walletStates.set(addr, st);
      }

      const key: UtxoKey = `${out.txid}_${out.n}`;
      if (!this.utxoLookup.has(key)) {
        this.utxoLookup.set(key, { address: addr, value: out.value });
        const bag = this.addressUtxos.get(addr) ?? [];
        bag.push(key);
        this.addressUtxos.set(addr, bag);
        st.balance = (BigInt(st.balance) + BigInt(out.value)).toString();
        st.utxoCount += 1;
      }

      const txset = this.addressTxids.get(addr) ?? new Set<string>();
      const before = txset.size;
      txset.add(out.txid);
      if (txset.size !== before) {
        this.addressTxids.set(addr, txset);
        st.txids = Array.from(txset);
      }

      st.lastActivity = bh;
    }
  }

  protected onWalletDebited(e: any): void {
    const { inputs } = e.payload as { inputs: InputRef[] };
    const bh = e.blockHeight as number;

    for (const inp of inputs) {
      const key: UtxoKey = `${inp.txid}_${inp.n}`;
      const utxo = this.utxoLookup.get(key);
      if (!utxo) continue;

      const addr = utxo.address;
      const st = this.walletStates.get(addr);
      if (!st) {
        this.utxoLookup.delete(key);
        continue;
      }

      this.utxoLookup.delete(key);

      const bag = this.addressUtxos.get(addr);
      if (bag) {
        const i = bag.indexOf(key);
        if (i !== -1) bag.splice(i, 1);
        bag.length ? this.addressUtxos.set(addr, bag) : this.addressUtxos.delete(addr);
      }

      const dec = BigInt(utxo.value);
      const cur = BigInt(st.balance);
      st.balance = (cur - dec >= 0n ? cur - dec : 0n).toString();
      st.utxoCount = Math.max(0, st.utxoCount - 1);
      st.lastActivity = bh;
    }
  }

  public getBalance(address: string): string {
    return this.walletStates.get(address)?.balance ?? '0';
  }

  public getAllBalances(): Record<string, string> {
    const res: Record<string, string> = {};
    for (const [addr, st] of this.walletStates) res[addr] = st.balance;
    for (const a of this.wallets) if (!(a in res)) res[a] = '0';
    return res;
  }

  public getUnspent(address: string): UtxoView[] {
    const keys = this.addressUtxos.get(address) ?? [];
    const res: UtxoView[] = [];
    for (const key of keys) {
      const meta = this.utxoLookup.get(key);
      if (!meta) continue;
      const [txid, nStr] = key.split('_');
      res.push({ txid, n: Number(nStr), value: meta.value });
    }
    return res;
  }

  public getAllUnspent(): Record<string, UtxoView[]> {
    const res: Record<string, UtxoView[]> = {};
    for (const a of this.wallets) res[a] = [];
    for (const [addr, keys] of this.addressUtxos) {
      const arr: UtxoView[] = [];
      for (const key of keys) {
        const meta = this.utxoLookup.get(key);
        if (!meta) continue;
        const [txid, nStr] = key.split('_');
        arr.push({ txid, n: Number(nStr), value: meta.value });
      }
      res[addr] = arr;
    }
    return res;
  }

  public getTxids(address: string): string[] {
    const set = this.addressTxids.get(address);
    return set ? Array.from(set) : [];
  }

  public getAllTxids(): Record<string, string[]> {
    const res: Record<string, string[]> = {};
    for (const a of this.wallets) res[a] = [];
    for (const [addr, set] of this.addressTxids) res[addr] = Array.from(set);
    return res;
  }

  private extractAddressFromVout(vout: any, net?: NetworkConfig['network']): string | undefined {
    try {
      if (vout.scriptPubKey?.addresses?.length) return vout.scriptPubKey.addresses[0];
      if (vout.scriptPubKey?.hex && net) {
        return ScriptUtilService.getScriptHashFromScriptPubKey(vout.scriptPubKey, net) || undefined;
      }
      return undefined;
    } catch { return undefined; }
  }
}
