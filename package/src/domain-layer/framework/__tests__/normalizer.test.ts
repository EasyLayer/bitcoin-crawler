import 'reflect-metadata';
import { normalizeModels } from '../normalizer';
import type { Walker } from '../declarative';

const noopWalker: Walker = async () => undefined;

class GoodClassModel {
  constructor() {}
  async processBlock() {}
}

class NoProcessBlock {
  constructor() {}
}

class NeedsArgs {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_x: string) {}
  async processBlock() {}
}

describe('normalizeModels', () => {
  it('passes through a class-based model with processBlock and zero-args ctor', () => {
    const [Result] = normalizeModels([GoodClassModel as any], noopWalker);
    expect(Result).toBe(GoodClassModel);
  });

  it('rejects a class without processBlock and not declarative', () => {
    expect(() => normalizeModels([NoProcessBlock as any], noopWalker)).toThrow(/Unsupported model provider/);
  });

  it('rejects a class-model with non-zero-args constructor', () => {
    expect(() => normalizeModels([NeedsArgs as any], noopWalker)).toThrow(
      /Model "NeedsArgs" must have a zero-args constructor/
    );
  });

  it('compiles a declarative model into a zero-args ctor', () => {
    const decl = {
      modelId: 'XYZ',
      state: () => ({ counter: 0 }),
      reducers: {},
      sources: {},
    };
    const [Result] = normalizeModels([decl as any], noopWalker);
    expect(typeof Result).toBe('function');
    expect((Result as any).length).toBe(0);
    expect(Result!.name).toBe('XYZModel');
  });

  it('rejects a declarative object missing modelId', () => {
    expect(() => normalizeModels([{ state: () => ({}) } as any], noopWalker)).toThrow(/Unsupported model provider/);
  });

  it('accepts declarative state as a plain object', () => {
    const decl = {
      modelId: 'OBJ',
      state: { counter: 0 },
    };
    const [Result] = normalizeModels([decl as any], noopWalker);
    expect(typeof Result).toBe('function');
  });

  it('rejects a non-object, non-function input', () => {
    expect(() => normalizeModels([42 as any], noopWalker)).toThrow(/Unsupported model provider/);
    expect(() => normalizeModels(['hello' as any], noopWalker)).toThrow(/Unsupported model provider/);
    expect(() => normalizeModels([null as any], noopWalker)).toThrow(/Unsupported model provider/);
  });
});
