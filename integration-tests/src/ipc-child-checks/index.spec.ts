import { resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { BitcoinNetworkInitializedEvent, BitcoinNetworkBlocksAddedEvent } from '@easylayer/bitcoin';
import { Client } from '@easylayer/transport-sdk';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import { AGGREGATE_ID } from './blocks.model';

jest.setTimeout(60000);

function makeDeferred() {
  let resolveFn!: () => void;
  const promise = new Promise<void>((res) => {
    resolveFn = res;
  });
  return { promise, resolve: resolveFn };
}

function waitChildReady(cp: ChildProcess, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMsg = (m: any) => {
      if (m && m.type === 'ready') {
        cleanup();
        resolve();
        return;
      }
      if (m && m.action === 'ping') {
        cleanup();
        resolve();
        return;
      }
    };
    const onExit = (code: number | null, signal: string | null) => {
      cleanup();
      reject(new Error(`child exited before ready (code=${code}, signal=${signal})`));
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('child did not become ready (timeout)'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      cp.off('message', onMsg);
      cp.off('exit', onExit);
      cp.off('error', onErr);
    };
    const onErr = (err: any) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    cp.on('message', onMsg);
    cp.once('exit', onExit);
    cp.once('error', onErr);
    const timer = setTimeout(onTimeout, Math.max(1, timeoutMs));
  });
}

describe('/Bitcoin Crawler: IPC Transport (server in child, client in parent)', () => {
  let app!: INestApplication | INestApplicationContext;
  let client!: Client;
  let child!: ChildProcess;

  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;

  const receivedBlockAddedEvents: any[] = [];
  let resolved = false;

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    eventsDeferred = makeDeferred();

    config({ path: resolve(process.cwd(), 'src/ipc-child-checks/.env') });

    await cleanDataFolder('eventstore');

    const appPath = resolve(process.cwd(), 'src/ipc-child-checks/ipc-child.runner.ts');

    child = fork(appPath, [], {
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: process.env,
    });

    await waitChildReady(child);

    client = new Client({
      transport: { type: 'ipc-parent', options: { child, pongPassword: 'pw' } },
    });

    client.subscribe('BlockAddedEvent', async (event: any) => {
      receivedBlockAddedEvents.push(event);
      if (!resolved && receivedBlockAddedEvents.length >= expectedEventCount) {
        resolved = true;
        eventsDeferred.resolve();
      }
    });

    await eventsDeferred.promise;
  });

  /* eslint-disable no-empty */
  afterAll(async () => {
    await (client as any)?.close?.().catch(() => undefined);
    if (child && child.pid) {
      try {
        child.kill('SIGTERM');
      } catch {}

      await new Promise<void>((resolve) => {
        const to = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(to);
          resolve();
        });
      }).catch(() => undefined);
    }

    await app?.close?.().catch(() => undefined);
    jest.restoreAllMocks();
  });
  /* eslint-enable no-empty */

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
