import 'reflect-metadata';
import { AppService } from '../app.service';
import type { ProvidersConfig } from '../config';

function makeService(urls: string[] | undefined) {
  const networkInit = jest.fn().mockResolvedValue(undefined);
  const mempoolInit = jest.fn().mockResolvedValue(undefined);
  const providersConfig: Pick<ProvidersConfig, 'PROVIDER_MEMPOOL_RPC_URLS'> = {
    PROVIDER_MEMPOOL_RPC_URLS: urls as any,
  };
  const svc = new AppService(
    { init: networkInit } as any,
    { init: mempoolInit } as any,
    providersConfig as any
  );
  return { svc, networkInit, mempoolInit };
}

describe('AppService.init', () => {
  it('calls mempoolCommandFactory.init when mempool URLs are non-empty', async () => {
    const { svc, networkInit, mempoolInit } = makeService(['http://x']);
    await svc.init();
    expect(mempoolInit).toHaveBeenCalledTimes(1);
    expect(networkInit).not.toHaveBeenCalled();
  });

  it('calls networkCommandFactory.init when mempool URLs are an empty array', async () => {
    const { svc, networkInit, mempoolInit } = makeService([]);
    await svc.init();
    expect(networkInit).toHaveBeenCalledTimes(1);
    expect(mempoolInit).not.toHaveBeenCalled();
  });

  it('calls networkCommandFactory.init when mempool URLs are undefined', async () => {
    const { svc, networkInit, mempoolInit } = makeService(undefined);
    await svc.init();
    expect(networkInit).toHaveBeenCalledTimes(1);
    expect(mempoolInit).not.toHaveBeenCalled();
  });

  it('passes a fresh uuid v4 requestId on each call', async () => {
    const { svc, networkInit } = makeService([]);
    await svc.init();
    const arg = networkInit.mock.calls[0]![0];
    expect(typeof arg.requestId).toBe('string');
    expect(arg.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
