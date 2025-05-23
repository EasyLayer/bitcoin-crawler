import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import { BlockAddedEvent, Outputs, Input } from './events';

const NETWORK: string = process.env.BITCOIN_CRAWLER_BLOCKCHAIN_NETWORK_NAME || 'testnet';
const CURRENCY: Currency = {
    code: 'BTC',
    minorUnit: 8,
};

export default class BalanceModel extends Model {
    address: string = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    outputs: Outputs = new Map();
    inputs: Input[] = [];

    constructor() {
        super('uniqAggregateId');
    }

    // protected toJsonPayload(): any {
    //     return {
    //         // Convert Blockchain to an array of blocks
    //         chain: this.chain.toArray(),
    //     };
    // }
    
    // protected fromSnapshot(state: any): void {
    //     if (state.chain && Array.isArray(state.chain)) {
    //         this.chain = new Blockchain({ maxSize: this.__maxSize });
    //         this.chain.fromArray(state.chain);
    //         // Recovering links in Blockchain
    //         restoreChainLinks(this.chain.head);
    //     }

    //     Object.setPrototypeOf(this, Network.prototype);
    // }
    

    async parseBlock({ block }: { block: any }) {
        const { tx, height, hash } = block;
        const outputs: Outputs = new Map();
        const inputs: Input[] = [];

        for (let transaction of tx) {
            const { txid, vin, vout } = transaction;

            for (const vo of vout) {
                const scriptHash: string | undefined = ScriptUtilService
                    .getScriptHashFromScriptPubKey(vo.scriptPubKey, NETWORK);

                if (!scriptHash || scriptHash !== this.address) {
                    continue;
                }

                // DEPOSITED EVENT

                const value = Money.fromDecimal(vo.value, CURRENCY).toCents();

                outputs.set(`${txid}_${vo.n}`, value);
            }

            for (const vi of vin) {
                // 
                if (vi.txid && vi.vout !== undefined) {

                    inputs.push({
                        txid,
                        outputTxid: vi.txid,
                        outputN: Number(vi.vout),
                    });
                }
            }
        }

        await this.apply(
            new BlockAddedEvent({
                aggregateId: this.aggregateId,
                requestId: uuidv4(),
                blockHeight: height,
                inputs,
                outputs
            })
        );
    }

    private onBlockAddedEvent({ payload }: BlockAddedEvent) {
        const { inputs, outputs } = payload;
        // hashes.forEach((hash: string) => {
        //     if (!this.blocks.has(hash)) {
        //         this.blocks.set(hash, []);
        //     } 
        // });
    }
}