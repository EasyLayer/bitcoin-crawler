import { resolve } from 'node:path';
import { config } from 'dotenv';
import { app } from 'electron';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkBlocksAddedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from '../reorganisation/blocks.model';

async function run() {
  await app.whenReady();

  config({ path: resolve(process.cwd(), 'src/desktop/.env') });
  await cleanDataFolder('eventstore');
  await bootstrap({
    Models: [BlocksModel],
    testing: {
      handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: 3 }],
    },
  });

  const db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
  await db.connect();

  const networkEvents = await db.all(`SELECT * FROM network ORDER BY id ASC`);
  const userEvents = await db.all(`SELECT * FROM BlocksModel ORDER BY id ASC`).catch(() => []);

  const out = {
    ok: true,
    network: {
      total: networkEvents.length,
      blocksAddedEventsCount: networkEvents.filter((e: any) => e.type === 'BitcoinNetworkBlocksAddedEvent').length,
    },
    user: {
      blockEventsCount: userEvents.filter((e: any) => e.type === 'BlockAddedEvent').length,
    },
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out));

  await db.close().catch(() => undefined);
  app.quit();
}

run().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  app.quit();
  process.exit(1);
});
