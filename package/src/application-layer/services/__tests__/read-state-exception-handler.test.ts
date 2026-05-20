import 'reflect-metadata';
import { Subject } from 'rxjs';
import { ReadStateExceptionHandlerService } from '../read-state-exception-handler.service';

function makeBus() {
  const subject = new Subject<any>();
  return {
    stream$: subject.asObservable(),
    emit: (val: any) => subject.next(val),
    subject,
  };
}

describe('ReadStateExceptionHandlerService', () => {
  let setImmediateSpy: jest.SpyInstance;
  let capturedCallbacks: Array<() => void>;

  beforeEach(() => {
    capturedCallbacks = [];
    setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation(((cb: () => void) => {
      capturedCallbacks.push(cb);
      return 0 as any;
    }) as any);
  });

  afterEach(() => {
    setImmediateSpy.mockRestore();
  });

  it('schedules setImmediate that throws the original Error', () => {
    const bus = makeBus();
    const svc = new ReadStateExceptionHandlerService(bus as any);
    svc.onModuleInit();

    const original = new Error('boom');
    bus.emit({ cause: {}, exception: original });

    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
    expect(capturedCallbacks.length).toBe(1);
    expect(() => capturedCallbacks[0]!()).toThrow(original);

    svc.onModuleDestroy();
  });

  it('wraps a non-Error exception into a new Error before throwing', () => {
    const bus = makeBus();
    const svc = new ReadStateExceptionHandlerService(bus as any);
    svc.onModuleInit();

    bus.emit({ cause: {}, exception: 'plain-string-error' });

    expect(capturedCallbacks.length).toBe(1);

    let thrown: any;
    try {
      capturedCallbacks[0]!();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('plain-string-error');

    svc.onModuleDestroy();
  });

  it('unsubscribes on onModuleDestroy', () => {
    const bus = makeBus();
    const svc = new ReadStateExceptionHandlerService(bus as any);
    svc.onModuleInit();
    expect(bus.subject.observed).toBe(true);

    svc.onModuleDestroy();
    expect(bus.subject.observed).toBe(false);
  });
});
