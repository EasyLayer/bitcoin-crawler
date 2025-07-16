import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { Client } from '@easylayer/transport-sdk';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import type { BlockAddedEvent } from './blocks.model';
import { AGGREGATE_ID } from './blocks.model';
import { mockBlocks, networkTableSQL, balanceTableSQL } from './mocks';

// Set timeout for all tests in this file
jest.setTimeout(60000); // 1 minute

describe('/Bitcoin Crawler: IPC Subscription Checks', () => {
  let dbService!: SQLiteService;
  let child: ChildProcess;
  let client: Client;

  // Deferred for receiving N events
  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useRealTimers();

    // Deferred factory
    const makeDeferred = () => {
      let resolveFn!: () => void;
      const promise = new Promise<void>((res) => {
        resolveFn = res;
      });
      return { promise, resolve: resolveFn };
    };
    eventsDeferred = makeDeferred();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/ipc-checks/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize single DB connection for projections
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/view.db') });
    await dbService.connect();

    // Create projection tables
    await dbService.exec(networkTableSQL);
    await dbService.exec(balanceTableSQL);

    const appPath = resolve(process.cwd(), 'src/ipc-checks/app.ts');
    const mockPath = resolve(process.cwd(), 'src/ipc-checks/app-mocks.ts');

    child = fork(appPath, [], {
      execArgv: ['-r', 'ts-node/register/transpile-only', '-r', mockPath],
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: process.env,
    });

    // Create a client with IPC transport
    client = new Client({
      transport: {
        type: 'ipc',
        child,
      },
    });

    let receivedEventCount = 0;

    // Subscribe to events and persist into projection tables.
    // IMPORTANT: At application startup, events arrive from the child process so quickly
    // that the child sends them before the connection is fully established.
    // Because we immediately throw an error in that case, the first event is rejected.
    // On the next attempt, two events arrive at once, so everything works correctly
    // but it's important to keep this behavior in mind.
    client.subscribe('BlockAddedEvent', async ({ payload }: BlockAddedEvent) => {
      const p = JSON.stringify(payload.block).replace(/'/g, "''");

      await dbService.exec(`
        INSERT INTO balance (requestId, type, payload, blockHeight)
        VALUES (
          '${payload.requestId}',
          'BlockAddedEvent',
          json('${p}'),
          ${payload.blockHeight}
        );
      `);

      receivedEventCount++;
      if (receivedEventCount >= expectedEventCount) {
        eventsDeferred.resolve();
      }
    });

    // Wait until expected number of events handled
    await eventsDeferred.promise;

    // Close the write database connection after inserting events
    await dbService.close();
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
  });

  it('should store at least 3 BlockAddedEvent entries in balance table', async () => {
    // Re-open DB for assertions
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/view.db') });
    await dbService.connect();

    const rows = await dbService.all(`SELECT * FROM balance;`);
    expect(rows).toHaveLength(mockBlocks.length);

    rows.forEach((row, idx) => {
      const block = JSON.parse(row.payload);
      // Compare with mockBlocks data
      const expectedBlock = mockBlocks[idx];
      expect(block.hash).toBe(expectedBlock!.hash);
      expect(block.height).toBe(expectedBlock!.height);
    });
  });

  it(`should return the full Network model at the latest block height`, async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: ['network'],
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveProperty('aggregateId', 'network');
    expect(payload).toHaveProperty('version', 4);
    expect(payload).toHaveProperty('blockHeight', 2);
    expect(payload.payload).toBeDefined();
    const modelPayload = payload.payload;

    expect(modelPayload.__type).toBeDefined();
    expect(modelPayload.__type).toBe('Network');
    expect(modelPayload.chain).toBeDefined();
    expect(modelPayload.chain.length).toBe(3);
  });

  it(`should return the Network model from cache`, async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: ['network'],
        blockHeight: 2,
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload.aggregateId).toBe('network');
    expect(payload.version).toBe(4);
    expect(payload.blockHeight).toBe(2);

    const modelPayload = payload.payload;
    expect(modelPayload.__type).toBe('Network');
    expect(modelPayload.chain.length).toBe(3);
  });

  it(`should return all events for Network model`, async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: ['network'],
      },
    });

    expect(requestId).toBe('reqid-1');
    expect(payload).toHaveLength(4);

    // 1st event - Initialization
    expect(payload[0]).toMatchObject({
      payload: {
        aggregateId: 'network',
        blockHeight: -1,
      },
    });
    expect(payload[0].constructor.name).toBe('BitcoinNetworkInitializedEvent');

    // 2nd event - First block
    expect(payload[1]).toMatchObject({
      payload: {
        aggregateId: 'network',
        blockHeight: 0,
      },
    });
    expect(payload[1].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');
    expect(Array.isArray(payload[1].payload.blocks)).toBe(true);

    // 3rd event - Second block
    expect(payload[2]).toMatchObject({
      payload: {
        aggregateId: 'network',
        blockHeight: 1,
      },
    });
    expect(payload[2].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');
    expect(Array.isArray(payload[2].payload.blocks)).toBe(true);

    // 4th event - Third block
    expect(payload[3]).toMatchObject({
      payload: {
        aggregateId: 'network',
        blockHeight: 2,
      },
    });
    expect(payload[3].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');
    expect(Array.isArray(payload[3].payload.blocks)).toBe(true);
  });

  it('should fetch Network model events with pagination', async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: ['network'],
        paging: { limit: 2, offset: 1 },
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveLength(2);
    expect(payload[0].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');

    expect(payload[1].payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(payload[1].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');
  });

  it(`should return the full BlocksModel at the latest block height`, async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'GetModelsQuery',
      dto: {
        modelIds: [AGGREGATE_ID],
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload.aggregateId).toBe(AGGREGATE_ID);
    expect(payload.version).toBe(3);
    expect(payload.blockHeight).toBe(2);

    const modelPayload = payload.payload;
    expect(modelPayload.__type).toBe('BlocksModel');
    expect(Array.isArray(modelPayload.blocks)).toBe(true);
    expect(modelPayload.blocks).toHaveLength(3);
  });

  it('should fetch BlocksModel events with pagination', async () => {
    const { requestId, payload } = await client.query('reqid-1', {
      constructorName: 'FetchEventsQuery',
      dto: {
        modelIds: [AGGREGATE_ID],
        paging: { limit: 2, offset: 1 },
      },
    });

    expect(requestId).toBe('reqid-1');

    expect(payload).toHaveLength(2);
    expect(payload[0].constructor.name).toBe('BlockAddedEvent');
  });
});
