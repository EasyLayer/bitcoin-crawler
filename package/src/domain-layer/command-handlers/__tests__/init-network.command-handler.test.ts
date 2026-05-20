import 'reflect-metadata';
import { InitNetworkCommandHandler } from '../init-network.command-handler';
import type { BusinessConfig, BootstrapConfig } from '../../../config';

interface SetupOpts {
  configStartHeight?: number;
  bootstrapLastBlockHeight?: number;
  currentNetworkHeight: number;
  currentDbHeight: number; // initial networkModel.lastBlockHeight
  // Allow simulating networkModel.lastBlockHeight changing after alignment.
  dbHeightAfterAlign?: number;
  promptConfirm?: boolean;
}

function setup(opts: SetupOpts) {
  const initMock = jest.fn().mockResolvedValue(undefined);
  const clearChainMock = jest.fn().mockResolvedValue(undefined);

  const networkModelState = {
    lastBlockHeight: opts.currentDbHeight,
  };

  const networkModel: any = {
    get lastBlockHeight() {
      return networkModelState.lastBlockHeight;
    },
    init: initMock,
    clearChain: clearChainMock,
  };

  // After alignToExternalCheckpoint rollback, factory.initModel() is called again
  // and should return a restored model. We allow opts.dbHeightAfterAlign to change it.
  const networkModelFactory = {
    initModel: jest
      .fn()
      .mockImplementationOnce(async () => networkModel)
      .mockImplementation(async () => {
        if (opts.dbHeightAfterAlign !== undefined) {
          networkModelState.lastBlockHeight = opts.dbHeightAfterAlign;
        }
        return networkModel;
      }),
  };

  const blockchainProviderService = {
    getCurrentBlockHeightFromNetwork: jest.fn().mockResolvedValue(opts.currentNetworkHeight),
  };

  const businessConfig: Pick<BusinessConfig, 'START_BLOCK_HEIGHT'> = {
    START_BLOCK_HEIGHT: opts.configStartHeight,
  };
  const bootstrapConfig: Pick<BootstrapConfig, 'lastBlockHeight'> = {
    lastBlockHeight: opts.bootstrapLastBlockHeight,
  };

  const askDataResetConfirmation = jest.fn().mockResolvedValue(opts.promptConfirm ?? false);
  const consolePromptService = { askDataResetConfirmation };

  const eventStore = {
    save: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };

  const modelFactoryService = {
    createNewModel: jest.fn((Ctor: any) => new Ctor()),
  };

  const Models: any[] = [];

  const handler = new InitNetworkCommandHandler(
    eventStore as any,
    networkModelFactory as any,
    businessConfig as any,
    blockchainProviderService as any,
    consolePromptService as any,
    Models,
    modelFactoryService as any,
    bootstrapConfig as any
  );

  return { handler, initMock, askDataResetConfirmation, eventStore };
}

const cmd = { payload: { requestId: 'req-1' } } as any;

describe('InitNetworkCommandHandler.determineStartHeight (via execute)', () => {
  // bootstrap === undefined
  it('1. bootstrap=undefined, empty DB, configStart=undefined → startHeight = currentNetworkHeight - 1', async () => {
    const { handler, initMock } = setup({
      currentNetworkHeight: 100,
      currentDbHeight: -1,
    });
    await handler.execute(cmd);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(99);
  });

  it('2. bootstrap=undefined, empty DB, configStart=100 → startHeight = 99', async () => {
    const { handler, initMock } = setup({
      configStartHeight: 100,
      currentNetworkHeight: 200,
      currentDbHeight: -1,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(99);
  });

  it('3. bootstrap=undefined, empty DB, configStart=0 (genesis) → startHeight = -1', async () => {
    const { handler, initMock } = setup({
      configStartHeight: 0,
      currentNetworkHeight: 200,
      currentDbHeight: -1,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(-1);
  });

  it('4. bootstrap=undefined, DB=50, configStart=undefined → 50', async () => {
    const { handler, initMock } = setup({
      currentNetworkHeight: 200,
      currentDbHeight: 50,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(50);
  });

  it('5. bootstrap=undefined, DB=50, configStart=30 (configStart < db) → 50', async () => {
    const { handler, initMock } = setup({
      configStartHeight: 30,
      currentNetworkHeight: 200,
      currentDbHeight: 50,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(50);
  });

  it('6. bootstrap=undefined, DB=50, configStart=51 (configStart == db+1) → 50', async () => {
    const { handler, initMock } = setup({
      configStartHeight: 51,
      currentNetworkHeight: 200,
      currentDbHeight: 50,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(50);
  });

  it('7. bootstrap=undefined, DB=50, configStart=100 (gap), prompt=yes → caught DATA_RESET_REQUIRED triggers clear', async () => {
    const { handler, initMock, askDataResetConfirmation, eventStore } = setup({
      configStartHeight: 100,
      currentNetworkHeight: 200,
      currentDbHeight: 50,
      promptConfirm: true,
    });
    await handler.execute(cmd); // DATA_RESET_REQUIRED is caught internally → triggers clear flow
    expect(askDataResetConfirmation).toHaveBeenCalledTimes(1);
    expect(initMock).not.toHaveBeenCalled(); // init() never called when reset requested
    expect(eventStore.rollback).toHaveBeenCalledTimes(1);
  });

  it('8. bootstrap=undefined, DB=50, configStart=100 (gap), prompt=no → rethrows "cancelled by user"', async () => {
    const { handler, askDataResetConfirmation } = setup({
      configStartHeight: 100,
      currentNetworkHeight: 200,
      currentDbHeight: 50,
      promptConfirm: false,
    });
    await expect(handler.execute(cmd)).rejects.toThrow(/cancelled by user/);
    expect(askDataResetConfirmation).toHaveBeenCalledTimes(1);
  });

  // bootstrap !== undefined
  it('9. bootstrap=50, empty DB → 50', async () => {
    const { handler, initMock } = setup({
      bootstrapLastBlockHeight: 50,
      currentNetworkHeight: 200,
      currentDbHeight: -1,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(50);
  });

  it('10. bootstrap=50, DB=50 → 50 (no rollback, no error)', async () => {
    const { handler, initMock, eventStore } = setup({
      bootstrapLastBlockHeight: 50,
      currentNetworkHeight: 200,
      currentDbHeight: 50,
    });
    await handler.execute(cmd);
    expect(initMock.mock.calls[0]![0].startHeight).toBe(50);
    expect(eventStore.rollback).not.toHaveBeenCalled();
  });

  it('11. bootstrap=50, DB=30 (behind) → "External checkpoint .. is ahead of local EventStore"', async () => {
    const { handler } = setup({
      bootstrapLastBlockHeight: 50,
      currentNetworkHeight: 200,
      currentDbHeight: 30,
    });
    await expect(handler.execute(cmd)).rejects.toThrow(/is ahead of local EventStore/);
  });
});
