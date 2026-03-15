import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type Block, type NetworkConfig } from '@easylayer/bitcoin';
import { Money, type Currency } from '@easylayer/common/arithmetic';

const CURRENCY: Currency = { code: 'BTC', minorUnit: 8 };
const ADDRESSES = ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'];


type Utxo = { txid: string; n: number; value: string }; // value: satoshi (string)
type UtxoKey = `${string}_${number}`;
type OutputHit = { address: string; txid: string; n: number; value: string };
type InputRef  = { txid: string; n: number };

export class AddressUtxoWatcher extends Model {
  static override modelId: string = 'my-model-name';

  private readonly wallets: ReadonlySet<string> = new Set(ADDRESSES);
  // unspent[address] -> UTXO[]
  public unspent = new Map<string, Utxo[]>();

  public async processBlock(
    ctx: any & { block: Block; networkConfig?: NetworkConfig }
  ): Promise<void> {
    const block = ctx.block; if (!block) return;
    const { tx = [], height } = block;
    const net = (ctx as any).networkConfig?.network as NetworkConfig['network'] | undefined;

    const outputs: OutputHit[] = [];
    const inputs: InputRef[] = [];

    // Unique duplicates within one block
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

    if (outputs.length || inputs.length) {
      this.applyEvent('BasicWalletDelta', height, { outputs, inputs });
    }
  }

  protected onBasicWalletDelta(e: any): void {
    const { outputs, inputs } = e.payload as { outputs: OutputHit[]; inputs: InputRef[] };

    for (const out of outputs) {
      const list = this.unspent.get(out.address) ?? [];
      const exists = list.some(u => u.txid === out.txid && u.n === out.n);
      if (!exists) {
        list.push({ txid: out.txid, n: out.n, value: out.value });
        this.unspent.set(out.address, list);
      }
    }

    if (inputs.length) {
      for (const [addr, list] of this.unspent) {
        let changed = false;
        for (let i = list.length - 1; i >= 0; i--) {
          const u = list[i];
          const spent = inputs.some(inp => inp.txid === u.txid && inp.n === u.n);
          if (spent) { list.splice(i, 1); changed = true; }
        }
        if (changed) {
          list.length ? this.unspent.set(addr, list) : this.unspent.delete(addr);
        }
      }
    }
  }

  public getBalance(address: string): string {
    const list = this.unspent.get(address);
    if (!list || !list.length) return '0';
    let sum = 0n;
    for (const u of list) sum += BigInt(u.value);
    return sum.toString();
  }

  public getAllBalances(): Record<string, string> {
    const res: Record<string, string> = {};
    for (const [addr, list] of this.unspent) {
      let sum = 0n;
      for (const u of list) sum += BigInt(u.value);
      res[addr] = sum.toString();
    }
    for (const a of this.wallets) if (!(a in res)) res[a] = '0';
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
