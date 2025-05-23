import { bootstrap } from '@easylayer/bitcoin-crawler';
import BalanceModel from './models';

bootstrap({
  Models: [BalanceModel],
  rpc: true,
}).catch((error: Error) => console.error(error));