import { resolve } from 'node:path';
import { config } from 'dotenv';
import { app } from 'electron';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return mockBlocks
    .filter((block: any) => hs.includes(Number(block.height)))
    .map((block: any) => ({ blockhash: block.hash, total_size: 1, height: Number(block.height) }));
};

BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return hs.map((height) => {
    const blk = mockBlocks.find((b: any) => Number(b.height) === height);
    if (!blk) throw new Error(`No mock block for height ${height}`);
    return blk;
  });
};

async function run() {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');

  const watchdog = setTimeout(() => app.exit(2), 30000);
  await app.whenReady();

  try {
    config({ path: resolve(process.cwd(), 'src/desktop/.env') });
    await cleanDataFolder('eventstore');

    const easylayer = await bootstrap({
      Models: [BlocksModel],
      testing: { handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: 3 }] },
    });

    await easylayer.close().catch(() => undefined);
    clearTimeout(watchdog);
    app.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    app.exit(1);
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  app.exit(1);
});
