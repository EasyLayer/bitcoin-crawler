import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, type NetworkConfig } from '@easylayer/bitcoin';
import { Money, type Currency } from '@easylayer/common/arithmetic';

export const CURRENCY: Currency = { code: 'BTC', minorUnit: 8 };

export interface AddressState {
  address: string;
  balance: string;
  firstSeen: number;
  lastActivity: number;
  utxoCount: number;
  transactionCount: number;
  totalReceived: string;
}
interface BalanceEntry { address: string; balance: string; }
interface StoredUtxo { address: string; value: string; }

type AddressOutput = { address: string; txid: string; n: number; value: string };
type AddressInput  = { txid: string; n: number };

type Store = {
  addressStates: Map<string, AddressState>;
  sortedBalances: BalanceEntry[];
  utxoLookup: Map<string, StoredUtxo>;
  addressUtxos: Map<string, string[]>;
  topLimit: number;
};

function extractAddressFromVout(vout: any, net?: NetworkConfig['network']): string | undefined {
  try {
    if (vout.scriptPubKey?.addresses?.length) return vout.scriptPubKey.addresses[0];
    if (vout.scriptPubKey?.hex && net) {
      return ScriptUtilService.getScriptHashFromScriptPubKey(vout.scriptPubKey, net) || undefined;
    }
    return undefined;
  } catch { return undefined; }
}

function updateSortedBalance(store: Store, address: string, newBalance: string) {
  const arr = store.sortedBalances;
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

function removeAddressCompletely(store: Store, address: string) {
  store.addressStates.delete(address);
  const list = store.addressUtxos.get(address);
  if (list) {
    for (const k of list) store.utxoLookup.delete(k);
    store.addressUtxos.delete(address);
  }
}

export const BtcBalancesDeclarative: DeclarativeModel<Store> = {
  name: 'BtcBalances',
  state: (): Store => ({
    addressStates: new Map(),
    sortedBalances: [],
    utxoLookup: new Map(),
    addressUtxos: new Map(),
    topLimit: 1000,
  }),

  sources: {
    rollupBlock: {
      from: 'block',
      async handler({ block, networkConfig, applyEvent }: any) {
        if (!block) return;
        const { tx = [], height } = block;
        const net = (networkConfig as NetworkConfig | undefined)?.network;

        const outputs: AddressOutput[] = [];
        const inputs: AddressInput[] = [];

        for (const t of tx) {
          const { txid, vout = [], vin = [] } = t;

          for (const o of vout) {
            const addr = extractAddressFromVout(o, net);
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
          await applyEvent('AddressBalanceChanged', height, { outputs, inputs });
        }
      },
    },
  },

  reducers: {
    AddressBalanceChanged(this: any, e: any) {
      const store = this.state as Store;
      const { outputs, inputs } = e.payload as { outputs: AddressOutput[]; inputs: AddressInput[] };
      const bh = e.blockHeight as number;

      // credits
      for (const out of outputs) {
        let st = store.addressStates.get(out.address);
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
          store.addressStates.set(out.address, st);
        }
        const inc = BigInt(out.value);
        st.balance = (BigInt(st.balance) + inc).toString();
        st.totalReceived = (BigInt(st.totalReceived) + inc).toString();
        st.lastActivity = bh;
        st.transactionCount++;
        st.utxoCount++;

        updateSortedBalance(store, out.address, st.balance);

        const key = `${out.txid}_${out.n}`;
        if (!store.utxoLookup.has(key)) store.utxoLookup.set(key, { address: out.address, value: out.value });
        const list = store.addressUtxos.get(out.address) ?? [];
        list.push(key);
        store.addressUtxos.set(out.address, list);
      }

      // debits
      for (const inp of inputs) {
        const key = `${inp.txid}_${inp.n}`;
        const utxo = store.utxoLookup.get(key);
        if (!utxo) continue;

        store.utxoLookup.delete(key);
        const list = store.addressUtxos.get(utxo.address);
        if (list) {
          const i = list.indexOf(key);
          if (i !== -1) list.splice(i, 1);
          if (!list.length) store.addressUtxos.delete(utxo.address);
          else store.addressUtxos.set(utxo.address, list);
        }

        const st = store.addressStates.get(utxo.address);
        if (!st) continue;

        const dec = BigInt(utxo.value);
        const cur = BigInt(st.balance);
        st.balance = (cur - dec >= 0n ? cur - dec : 0n).toString();
        st.lastActivity = bh;
        st.transactionCount++;
        st.utxoCount = Math.max(0, st.utxoCount - 1);

        updateSortedBalance(store, utxo.address, st.balance);
        if (st.balance === '0' && st.utxoCount === 0) {
          removeAddressCompletely(store, utxo.address);
        }
      }

      if (store.sortedBalances.length > store.topLimit) {
        const drop = store.sortedBalances.slice(store.topLimit).map(x => x.address);
        store.sortedBalances.length = store.topLimit;
        for (const a of drop) removeAddressCompletely(store, a);
      }
    },
  },

  options: {
    snapshotsEnabled: true,
    snapshotInterval: 1000,
  },
};

export const BtcBalances = compileStateModelBTC<Store>(BtcBalancesDeclarative);
