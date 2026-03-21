// Child process: runs the full bitcoin-crawler NestJS context.
// Outbox events are sent to the parent process via IPC (ipc-child transport).
// Env vars must include:
//   TRANSPORT_OUTBOX_ENABLE=1
//   TRANSPORT_OUTBOX_KIND=ipc-child

import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';
import { GetBalanceQueryHandler } from './query';

(async () => {
  await bootstrap({
    Models: [AddressUtxoWatcher],
    QueryHandlers: [GetBalanceQueryHandler],
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
