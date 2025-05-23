import { bootstrap } from '@easylayer/bitcoin-crawler';
import BlockModel, { AGGREGATE_ID } from './blocks.model';

async function start() {
  await bootstrap({
    Models: [BlockModel],
    ipc: true,
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
