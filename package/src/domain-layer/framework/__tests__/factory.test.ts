import 'reflect-metadata';
import { ModelFactoryService } from '../factory';
import type { BusinessConfig } from '../../../config';

class SimpleModel {
  // zero-args
  constructor() {}
}

class ModelRequiringArgs {
  // Constructor that actively throws when invoked without args
  constructor() {
    throw new Error('cannot construct without args');
  }
}

function svc(startBlockHeight: number | undefined): ModelFactoryService {
  const config: Pick<BusinessConfig, 'START_BLOCK_HEIGHT'> = { START_BLOCK_HEIGHT: startBlockHeight };
  const eventStore = {} as any;
  return new ModelFactoryService(config as any, eventStore);
}

describe('ModelFactoryService.createNewModel', () => {
  it('creates an instance of the model ctor', () => {
    const inst = svc(undefined).createNewModel(SimpleModel as any);
    expect(inst).toBeInstanceOf(SimpleModel);
  });

  it('sets _lastBlockHeight = -1 when START_BLOCK_HEIGHT is undefined', () => {
    const inst = svc(undefined).createNewModel(SimpleModel as any);
    expect((inst as any)._lastBlockHeight).toBe(-1);
  });

  it('sets _lastBlockHeight = -1 when START_BLOCK_HEIGHT is 0', () => {
    const inst = svc(0).createNewModel(SimpleModel as any);
    expect((inst as any)._lastBlockHeight).toBe(-1);
  });

  it('sets _lastBlockHeight = START_BLOCK_HEIGHT - 1 for a positive start', () => {
    const inst = svc(100).createNewModel(SimpleModel as any);
    expect((inst as any)._lastBlockHeight).toBe(99);
  });

  it('wraps constructor errors with model name', () => {
    expect(() => svc(undefined).createNewModel(ModelRequiringArgs as any)).toThrow(
      /Model "ModelRequiringArgs" must have a zero-args constructor/
    );
  });
});
