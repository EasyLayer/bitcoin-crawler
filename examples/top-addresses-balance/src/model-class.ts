import { Model } from '@easylayer/bitcoin-crawler';
import type { ExecutionContext } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type Block, type NetworkConfig } from '@easylayer/bitcoin';
import { Money, type Currency } from '@easylayer/common/arithmetic';

export const CURRENCY: Currency = { code: 'BTC', minorUnit: 8 };

export interface AddressState {
  address: string;
  balance: string;         // sat (string)
  firstSeen: number;
  lastActivity: number;
  utxoCount: number;
  transactionCount: number;
  totalReceived: string;   // sat (string)
}
interface BalanceEntry { address: string; balance: string; }
interface StoredUtxo { address: string; value: string; }

type AddressOutput = { address: string; txid: string; n: number; value: string };
type AddressInput  = { txid: string; n: number };

export class BtcBalances extends Model {
  // тот же стейт, что и в большой модели (без кеша и без applied)
  public addressStates = new Map<string, AddressState>();
  public sortedBalances: BalanceEntry[] = [];
  public utxoLookup = new Map<string, StoredUtxo>();        // key = `${txid}_${n}`
  public addressUtxos = new Map<string, string[]>();         // address -> [utxoKey]
  public topLimit = 1000;

  constructor() {
    super('BtcBalances', -1);
  }

  public async processBlock(
    ctx: ExecutionContext & { block: Block; networkConfig?: NetworkConfig }
  ): Promise<void> {
    const block = ctx.block; if (!block) return;
    const { tx = [], height } = block;
    const net = (ctx as any).networkConfig?.network as NetworkConfig['network'] | undefined;

    const outputs: AddressOutput[] = [];
    const inputs: AddressInput[] = [];

    for (const t of tx) {
      const { txid, vout = [], vin = [] } = t;

      for (const o of vout) {
        const addr = this.extractAddressFromVout(o, net);
        if (!addr) continue;
        const sat = Money.fromDecimal(o.value.toString(), CURRENCY).toCents().toString();
        outputs.push({ address: addr, txid, n: o.n, value: sat });
      }

      for (const i of vin) {
        if (i.coinbase) continue;
        if (!i.txid || i.vout === undefined) continue;
        inputs.push({ txid: i.txid, n: i.vout });
      }
    }

    if (outputs.length || inputs.length) {
      this.applyEvent('AddressBalanceChanged', height, { outputs, inputs });
    }
  }

  // ===== Reducer =====
  protected onAddressBalanceChanged(e: any): void {
    const { outputs, inputs } = e.payload as { outputs: AddressOutput[]; inputs: AddressInput[] };
    const bh = e.blockHeight as number;

    // 1) кредиты: пополняем баланс и индексируем UTXO
    for (const out of outputs) {
      let st = this.addressStates.get(out.address);
      if (!st) {
        st = {
          address: out.address,
          balance: '0',
          firstSeen: bh,
          lastActivity: bh,
          utxoCount: 0,
          transactionCount: 0,
          totalReceived: '0',
        };
        this.addressStates.set(out.address, st);
      }

      const inc = BigInt(out.value);
      st.balance = (BigInt(st.balance) + inc).toString();
      st.totalReceived = (BigInt(st.totalReceived) + inc).toString();
      st.lastActivity = bh;
      st.transactionCount++;
      st.utxoCount++;

      this.updateSortedBalance(out.address, st.balance);

      const key = `${out.txid}_${out.n}`;
      if (!this.utxoLookup.has(key)) this.utxoLookup.set(key, { address: out.address, value: out.value });
      const list = this.addressUtxos.get(out.address) ?? [];
      list.push(key);
      this.addressUtxos.set(out.address, list);
    }

    // 2) дебеты: списываем и удаляем UTXO
    for (const inp of inputs) {
      const key = `${inp.txid}_${inp.n}`;
      const utxo = this.utxoLookup.get(key);
      if (!utxo) continue;

      this.utxoLookup.delete(key);
      const list = this.addressUtxos.get(utxo.address);
      if (list) {
        const i = list.indexOf(key);
        if (i !== -1) list.splice(i, 1);
        if (!list.length) this.addressUtxos.delete(utxo.address);
        else this.addressUtxos.set(utxo.address, list);
      }

      const st = this.addressStates.get(utxo.address);
      if (!st) continue;

      const dec = BigInt(utxo.value);
      const cur = BigInt(st.balance);
      st.balance = (cur - dec >= 0n ? cur - dec : 0n).toString();
      st.lastActivity = bh;
      st.transactionCount++;
      st.utxoCount = Math.max(0, st.utxoCount - 1);

      this.updateSortedBalance(utxo.address, st.balance);
      if (st.balance === '0' && st.utxoCount === 0) {
        this.removeAddressCompletely(utxo.address);
      }
    }

    // опциональная жёсткая усечка топа
    this.limitToTopAddresses();
  }

  // ===== helpers =====
  private extractAddressFromVout(vout: any, net?: NetworkConfig['network']): string | undefined {
    try {
      if (vout.scriptPubKey?.addresses?.length) return vout.scriptPubKey.addresses[0];
      if (vout.scriptPubKey?.hex && net) {
        return ScriptUtilService.getScriptHashFromScriptPubKey(vout.scriptPubKey, net) || undefined;
      }
      return undefined;
    } catch { return undefined; }
  }

  private updateSortedBalance(address: string, newBalance: string) {
    const arr = this.sortedBalances;
    const idx = arr.findIndex(e => e.address === address);
    if (idx !== -1) arr.splice(idx, 1);

    const val = BigInt(newBalance);
    let l = 0, r = arr.length;
    while (l < r) {
      const m = (l + r) >> 1;
      const mid = BigInt(arr[m].balance);
      (val > mid) ? r = m : l = m + 1;
    }
    arr.splice(l, 0, { address, balance: newBalance });
  }

  private limitToTopAddresses() {
    if (this.sortedBalances.length <= this.topLimit) return;
    const drop = this.sortedBalances.slice(this.topLimit).map(x => x.address);
    this.sortedBalances.length = this.topLimit;
    for (const a of drop) this.removeAddressCompletely(a);
  }

  private removeAddressCompletely(address: string) {
    this.addressStates.delete(address);
    const list = this.addressUtxos.get(address);
    if (list) {
      for (const k of list) this.utxoLookup.delete(k);
      this.addressUtxos.delete(address);
    }
  }
}
