import { resolve } from 'node:path';
import { config } from 'dotenv';
import { app } from 'electron';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

const LAST_MOCK_HEIGHT = mockBlocks[mockBlocks.length - 1]!.height;

function cloneMockBlock(block: any): any {
  return JSON.parse(JSON.stringify(block));
}

function toRawMockBlock(block: any): any {
  return {
    hash: block.hash,
    height: Number(block.height),
    size: Number(block.size ?? 1),
    bytes: Buffer.from(`mock-bitcoin-block:${block.height}`),
  };
}

BlockchainProviderService.prototype.getCurrentBlockHeightFromNetwork = async function (): Promise<number> {
  return LAST_MOCK_HEIGHT;
};

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return mockBlocks
    .filter((block: any) => hs.includes(Number(block.height)))
    .map((block: any) => ({ blockhash: block.hash, total_size: block.size ?? 1, height: Number(block.height) }));
};

BlockchainProviderService.prototype.getManyBlocksRawByHeights = async function (heights: number[]): Promise<any[]> {
  return heights.map((height) => {
    const block = mockBlocks.find((item: any) => Number(item.height) === Number(height));
    if (!block) throw new Error(`No mock raw block for height ${height}`);
    return toRawMockBlock(block);
  });
};

BlockchainProviderService.prototype.parseBlock = function (_bytes: Buffer, height: number): any {
  const block = mockBlocks.find((item: any) => Number(item.height) === Number(height));
  if (!block) throw new Error(`No mock parsed block for height ${height}`);
  return cloneMockBlock(block);
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
