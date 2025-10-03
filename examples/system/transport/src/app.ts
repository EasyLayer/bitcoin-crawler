import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';
import {
    GetBalanceQueryHandler
} from './query';

(async () => {  
  await bootstrap({
    Models: [AddressUtxoWatcher],
    QueryHandlers: [GetBalanceQueryHandler]
  })
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
