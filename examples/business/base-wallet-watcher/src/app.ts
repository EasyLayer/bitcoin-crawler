import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BaseWalletWatcher } from './model';
import {
  GetBalanceQueryHandler,
  GetUnspentQueryHandler,
  GetTxidsQueryHandler,
} from './queries';

(async () => {  
  await bootstrap({
    Models: [BaseWalletWatcher],
    QueryHandlers: [
        GetBalanceQueryHandler,
        GetUnspentQueryHandler,
        GetTxidsQueryHandler,
    ]
  })
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
