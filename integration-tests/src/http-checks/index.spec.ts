import { resolve } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import {
  BlockchainProviderService,
  BitcoinNetworkInitializedEvent,
  BitcoinNetworkBlocksAddedEvent,
} from '@easylayer/bitcoin';
import { Client } from '@easylayer/transport-sdk';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from './mocks';

jest.setTimeout(60000);

async function getFreePort(host = '127.0.0.1'): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, host, r));
  const port = (srv.address() as any).port as number;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

describe('/Bitcoin Crawler: HTTP Transport', () => {
  let app!: INestApplication | INestApplicationContext;
  let client!: Client;
  let webhookSrv: HttpServer | undefined;

  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;

  const receivedBlockAddedEvents: any[] = [];
  let resolved = false;

  const envBackup: Partial<Record<string, string | undefined>> = {
    HTTP_WEBHOOK_URL: process.env.HTTP_WEBHOOK_URL,
    HTTP_WEBHOOK_PING_URL: process.env.HTTP_WEBHOOK_PING_URL,
  };

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    const makeDeferred = () => {
      let resolveFn!: () => void;
      const promise = new Promise<void>((res) => {
        resolveFn = res;
      });
      return { promise, resolve: resolveFn };
    };
    eventsDeferred = makeDeferred();

    config({ path: resolve(process.cwd(), 'src/http-checks/.env') });

    await cleanDataFolder('eventstore');

    const port = await getFreePort();
    const host = '127.0.0.1';
    const webhookUrl = `http://${host}:${port}/events`;
    const pingUrl = `http://${host}:${port}/ping`;

    process.env.TRANSPORT_HTTP_WEBHOOK_URL = webhookUrl;
    process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL = pingUrl;

    const baseUrl = `http://${process.env.TRANSPORT_HTTP_HOST}:${process.env.TRANSPORT_HTTP_PORT}`.replace(/\/+$/, '');
    client = new Client({
      transport: {
        type: 'http',
        inbound: { webhookUrl },
        query: { baseUrl },
      },
    });

    webhookSrv = createServer(client.nodeHttpHandler());
    await new Promise<void>((r) => webhookSrv!.listen(port, host, r));

    jest
      .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
      .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
        return mockBlocks
          .filter((block: any) => heights.includes(block.height))
          .map((block: any) => ({ blockhash: block.hash, total_size: 1, height: block.height }));
      });

    jest
      .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
      .mockImplementation(async (heights: any[]): Promise<any[]> => {
        return heights.map((height) => {
          const blk = mockBlocks.find((b) => b.height === height);
          if (!blk) throw new Error(`No mock block for height ${height}`);
          return blk;
        });
      });

    app = await bootstrap({ Models: [BlocksModel] });

    client.subscribe('BlockAddedEvent', async (event: any) => {
      receivedBlockAddedEvents.push(event);
      if (!resolved && receivedBlockAddedEvents.length >= expectedEventCount) {
        resolved = true;
        eventsDeferred.resolve();
      }
    });

    await eventsDeferred.promise;
  });

  afterAll(async () => {
    process.env.TRANSPORT_HTTP_WEBHOOK_URL = envBackup.TRANSPORT_HTTP_WEBHOOK_URL;
    process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL = envBackup.TRANSPORT_HTTP_WEBHOOK_PING_URL;
    await (client as any)?.close?.().catch(() => undefined);
    await Promise.race([
      new Promise<void>((r) => webhookSrv?.close?.(() => r())),
      new Promise<void>((r) => setTimeout(r, 2000)),
    ]).catch(() => undefined);

    await app?.close?.().catch(() => undefined);
    jest.restoreAllMocks();

    await new Promise((r) => setImmediate(r));
  });

  it('should get three BlockAddedEvent events', () => {
    expect(receivedBlockAddedEvents.length).toBe(expectedEventCount);
    expect(receivedBlockAddedEvents.every((e) => e?.eventType === 'BlockAddedEvent')).toBe(true);
    expect(receivedBlockAddedEvents.map((e) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should return the full Network model at the latest block height', async () => {
    const [networkModel] = await client.query<any, any>('GetModelsQuery', { modelIds: ['network'] });
    expect(networkModel.modelId).toBe('network');
    expect(networkModel.version).toBe(3);
    expect(networkModel.blockHeight).toBe(2);
    expect(networkModel.payload.__type).toBe('Network');
    expect(Array.isArray(networkModel.payload.chain)).toBe(true);
    expect(networkModel.payload.chain.length).toBe(3);
  });

  it('should return all events for Network model', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', { modelIds: ['network'] });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(4);
    expect(events[0].eventType).toBe(BitcoinNetworkInitializedEvent.name);
    expect(events[1].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[2].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[3].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[1].blockHeight).toBe(0);
    expect(events[1].requestId).toBeDefined();
    expect(events[1].payload.blocks.length).toBe(1);
    expect(events[2].blockHeight).toBe(1);
    expect(events[2].requestId).toBeDefined();
    expect(events[2].payload.blocks.length).toBe(1);
    expect(events[3].blockHeight).toBe(2);
    expect(events[3].requestId).toBeDefined();
    expect(events[3].payload.blocks.length).toBe(1);
  });

  it('should fetch Network model events with pagination', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', {
      modelIds: ['network'],
      paging: { limit: 3, offset: 1 },
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3);
    expect(events[0].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[1].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[2].eventType).toBe(BitcoinNetworkBlocksAddedEvent.name);
    expect(events[0].blockHeight).toBe(0);
    expect(events[1].blockHeight).toBe(1);
    expect(events[2].blockHeight).toBe(2);
  });

  it('should return the full BlocksModel at the latest block height', async () => {
    const [blocksModel] = await client.query<any, any>('GetModelsQuery', { modelIds: [AGGREGATE_ID] });
    expect(blocksModel.modelId).toBe(AGGREGATE_ID);
    expect(blocksModel.version).toBe(3);
    expect(blocksModel.blockHeight).toBe(2);
    expect(blocksModel.payload.__type).toBe('BlocksModel');
    expect(Array.isArray(blocksModel.payload.blocks)).toBe(true);
    expect(blocksModel.payload.blocks.length).toBe(3);
  });

  it('should return all events for BlocksModel model', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', { modelIds: [AGGREGATE_ID] });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3);
    expect(events.every((e: any) => e.eventType === 'BlockAddedEvent')).toBe(true);
    expect(events.map((e: any) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should fetch BlocksModel events with pagination', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', {
      modelIds: [AGGREGATE_ID],
      paging: { limit: 2, offset: 1 },
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(2);
    expect(events.every((e: any) => e.eventType === 'BlockAddedEvent')).toBe(true);
    expect(events.map((e: any) => e.blockHeight)).toEqual([1, 2]);
  });
});
