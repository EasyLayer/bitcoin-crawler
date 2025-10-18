import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AdvancedWalletWatcher } from './model';
import {
  GetTxStatusQueryHandler,
  GetAddressSeenQueryHandler,
} from './queries';

(async () => {  
  await bootstrap({
    Models: [AdvancedWalletWatcher],
    QueryHandlers: [
      GetTxStatusQueryHandler,
      GetAddressSeenQueryHandler,
    ]
  })
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
