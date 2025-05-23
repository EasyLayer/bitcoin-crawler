import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { Client } from '@easylayer/transport-sdk';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlockModel, { AGGREGATE_ID } from './blocks.model';
import type { NetworkEventStoreRecord, BlocksEventStoreRecord } from './mocks';
import { networkTableSQL, blocksTableSQL, mockNetworks, mockBlockModel, mockBlocks } from './mocks';

// IMPORTANT: We set BITCOIN_CRAWLER_MAX_BLOCK_HEIGHT=2 and add blocks up to this height to the database
// so that the application will spin but not get new blocks.

describe('/Bitcoin Crawler: IPC Transport Checks', () => {
  let dbService!: SQLiteService;
  let child: ChildProcess;
  let client: Client;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/ipc-checks/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize the write database
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    await dbService.exec(networkTableSQL);

    for (const rec of mockNetworks as NetworkEventStoreRecord[]) {
      const payloadSql = JSON.stringify(rec.payload).replace(/'/g, "''");
      const values = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `json('${payloadSql}')`,
        rec.blockHeight,
      ].join(', ');
      await dbService.exec(`
        INSERT INTO network
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${values});
      `);
    }

    await dbService.exec(blocksTableSQL);

    for (const rec of mockBlockModel as BlocksEventStoreRecord[]) {
      const payloadSql = JSON.stringify(rec.payload).replace(/'/g, "''");
      const values = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `json('${payloadSql}')`,
        rec.blockHeight,
      ].join(', ');
      await dbService.exec(`
        INSERT INTO ${AGGREGATE_ID}
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${values});
      `);
    }

    // Close the write database connection after inserting events
    await dbService.close();

    child = fork(resolve(process.cwd(), 'src/ipc-checks/app.ts'), [], {
      execArgv: ['-r', 'ts-node/register'],
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: process.env,
    });

    client = new Client({
      transport: {
        type: 'ipc',
        child,
      },
    });
    // jest.advanceTimersByTime(2000);
    jest.runAllTimers();
  });

  afterAll(async () => {
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }

    if (child) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));
    }

    jest.useRealTimers();
  });

  it(`should return the full Network model at the latest block height`, async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: ['network'],
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveProperty('aggregateId', 'network');
    expect(payload).toHaveProperty('version', 3);
    expect(payload).toHaveProperty('blockHeight', 2);
    expect(payload.payload).toBeDefined();
    const modelPayload = JSON.parse(payload.payload);

    expect(modelPayload.__type).toBeDefined();
    expect(modelPayload.__type).toBe('Network');
    expect(modelPayload.chain).toBeDefined();
    expect(modelPayload.chain.length).toBe(3);
  });

  it(`should return the Network model from cache`, async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: ['network'],
        blockHeight: 2,
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload.aggregateId).toBe('network');
    expect(payload.version).toBe(3);
    expect(payload.blockHeight).toBe(2);

    const modelPayload = JSON.parse(payload.payload);
    expect(modelPayload.__type).toBe('Network');
    expect(modelPayload.chain.length).toBe(3);
  });

  it(`should return all events for Network model`, async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: ['network'],
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveLength(3);

    // 1st event
    expect(payload[0]).toMatchObject({
      payload: { aggregateId: 'network', requestId: 'req-1', blockHeight: 0 },
    });
    expect(payload[0].constructor.name).toBe('BitcoinNetworkInitializedEvent');

    // 2nd event
    const evt = payload[1];
    expect(evt.payload.aggregateId).toBe('network');
    expect(evt.payload.requestId).toBe('req-2');
    expect(evt.payload.blockHeight).toBe(2);

    expect(Array.isArray(evt.payload.blocks)).toBe(true);
    expect(evt.payload.blocks).toHaveLength(mockBlocks.length);
    expect(evt.constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');

    // 3rd event
    expect(payload[2].payload.blockHeight).toBe(2);
    expect(payload[2].payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(payload[2].constructor.name).toBe('BitcoinNetworkInitializedEvent');
  });

  it('should fetch Network model events with pagination', async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: ['network'],
        paging: { limit: 2, offset: 1 },
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveLength(2);
    expect(payload[0].payload.requestId).toBe('req-2');
    expect(payload[0].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');

    expect(payload[1].payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(payload[1].constructor.name).toBe('BitcoinNetworkInitializedEvent');
  });

  it(`should return the full BlocksModel at the latest block height`, async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: [AGGREGATE_ID],
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload.aggregateId).toBe(AGGREGATE_ID);
    expect(payload.version).toBe(3);
    expect(payload.blockHeight).toBe(2);

    const modelPayload = JSON.parse(payload.payload);
    expect(modelPayload.__type).toBe('BlocksModel');
    expect(Array.isArray(modelPayload.blocks)).toBe(true);
    expect(modelPayload.blocks).toHaveLength(3);
  });

  it('should fetch BlocksModel events with pagination', async () => {
    const { requestId, payload } = await client.request('query', 'reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: [AGGREGATE_ID],
        paging: { limit: 2, offset: 1 },
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveLength(2);
    expect(payload[0].payload.requestId).toBe('req-2');
    expect(payload[0].constructor.name).toBe('BlockAddedEvent');
  });
});
