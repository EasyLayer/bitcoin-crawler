import { ScriptUtilService, type NetworkConfig } from '@easylayer/bitcoin';
import { Money, type Currency } from '@easylayer/common/arithmetic';
import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';

const CURRENCY: Currency = { code: 'BTC', minorUnit: 8 };
const ADDRESSES = ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'];

type Utxo = { txid: string; n: number; value: string };
type OutputHit = { address: string; txid: string; n: number; value: string };
type InputRef  = { txid: string; n: number };

export const AddressUtxoWatcherModel: DeclarativeModel<any> = {
  modelId: 'my-model-name',

  state() {
    return {
      wallets: new Set(ADDRESSES) as ReadonlySet<string>,
      unspent: new Map<string, Utxo[]>(),
    };
  },

  sources: {
    async vout(ctx: any): Promise<OutputHit | void> {
      const net = (ctx as any).networkConfig?.network as NetworkConfig['network'] | undefined;
      const addr = extractAddressFromVout(ctx.vout, net);
      if (!addr) return;
      if (!ctx.state.wallets.has(addr)) return;

      const sat = Money.fromDecimal(ctx.vout.value.toString(), CURRENCY).toCents().toString();
      return { address: addr, txid: ctx.tx.txid, n: ctx.vout.n, value: sat };
    },

    async vin(ctx: any): Promise<InputRef | void> {
      if (ctx.vin.coinbase) return;
      if (ctx.vin.txid === undefined || ctx.vin.vout === undefined) return;
      return { txid: ctx.vin.txid, n: ctx.vin.vout };
    },

    async block(ctx: any): Promise<void> {
      const outputs = ctx.locals.vout as OutputHit[];
      const inputs  = ctx.locals.vin  as InputRef[];

      if (outputs.length || inputs.length) {
        ctx.applyEvent('BasicWalletDelta', ctx.block.height, { outputs, inputs });
      }
    },
  },

  reducers: {
    BasicWalletDelta(state: { unspent: Map<string, Utxo[]> }, e: any) {
      const { outputs, inputs } = e.payload as { outputs: OutputHit[]; inputs: InputRef[] };

      for (const out of outputs) {
        const list = state.unspent.get(out.address) ?? [];
        if (!list.some(u => u.txid === out.txid && u.n === out.n)) {
          list.push({ txid: out.txid, n: out.n, value: out.value });
          state.unspent.set(out.address, list);
        }
      }

      if (inputs.length) {
        for (const [addr, list] of state.unspent) {
          let changed = false;
          for (let i = list.length - 1; i >= 0; i--) {
            const u = list[i];
            const spent = inputs.some(inp => inp.txid === u.txid && inp.n === u.n);
            if (spent) { list.splice(i, 1); changed = true; }
          }
          if (changed) {
            list.length ? state.unspent.set(addr, list) : state.unspent.delete(addr);
          }
        }
      }
    },
  },

  selectors: {
    getBalance(state: { unspent: Map<string, Utxo[]> }, address: string): string {
      const list = state.unspent.get(address);
      if (!list || !list.length) return '0';
      let sum = 0n;
      for (const u of list) sum += BigInt(u.value);
      return sum.toString();
    },

    getAllBalances(state: { unspent: Map<string, Utxo[]>; wallets: ReadonlySet<string> }): Record<string, string> {
      const res: Record<string, string> = {};
      for (const [addr, list] of state.unspent) {
        let sum = 0n;
        for (const u of list) sum += BigInt(u.value);
        res[addr] = sum.toString();
      }
      for (const a of state.wallets) if (!(a in res)) res[a] = '0';
      return res;
    },
  },
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

export const AddressUtxoWatcher = compileStateModelBTC<any>(AddressUtxoWatcherModel);
