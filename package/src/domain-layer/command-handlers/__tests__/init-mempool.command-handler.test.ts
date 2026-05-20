import 'reflect-metadata';
import { InitMempoolCommandHandler } from '../init-mempool.command-handler';
import type { BusinessConfig } from '../../../config';

function makeHandler(startBlockHeight: number | undefined, opts?: { mempoolInit?: jest.Mock; save?: jest.Mock }) {
  const mempoolInit = opts?.mempoolInit ?? jest.fn().mockResolvedValue(undefined);
  const save = opts?.save ?? jest.fn().mockResolvedValue(undefined);

  const mempoolStub = { init: mempoolInit };
  const mempoolModelFactory = { initModel: jest.fn().mockResolvedValue(mempoolStub) };
  const eventStore = { save };
  const blockchainProviderService = {
    getCurrentBlockHeightFromMempool: jest.fn().mockResolvedValue(800000),
  };

  const businessConfig: Pick<BusinessConfig, 'START_BLOCK_HEIGHT'> = {
    START_BLOCK_HEIGHT: startBlockHeight,
  };

  const handler = new InitMempoolCommandHandler(
    eventStore as any,
    mempoolModelFactory as any,
    blockchainProviderService as any,
    businessConfig as any
  );

  return { handler, mempoolInit, save };
}

const command = { payload: { requestId: 'req-test-1' } } as any;

describe('InitMempoolCommandHandler', () => {
  it('proceeds to mempoolModel.init when START_BLOCK_HEIGHT is undefined', async () => {
    const { handler, mempoolInit, save } = makeHandler(undefined);
    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(mempoolInit).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('throws when START_BLOCK_HEIGHT is 0 (regression: previous truthy check let 0 through)', async () => {
    const { handler, mempoolInit, save } = makeHandler(0);
    await expect(handler.execute(command)).rejects.toThrow(
      'Mempool cannot be initialized with the specified START_BLOCK_HEIGHT parameter'
    );
    expect(mempoolInit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('throws when START_BLOCK_HEIGHT is a positive number', async () => {
    const { handler, mempoolInit, save } = makeHandler(100);
    await expect(handler.execute(command)).rejects.toThrow(
      'Mempool cannot be initialized with the specified START_BLOCK_HEIGHT parameter'
    );
    expect(mempoolInit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
