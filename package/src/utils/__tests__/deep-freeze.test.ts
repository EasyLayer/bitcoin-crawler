import { deepFreeze } from '../deep-freeze';

describe('deepFreeze', () => {
  it('freezes a flat object', () => {
    const o = deepFreeze({ a: 1, b: 'x' });
    expect(Object.isFrozen(o)).toBe(true);
  });

  it('freezes nested objects at every depth', () => {
    const o = deepFreeze({ a: 1, nested: { b: 2, deeper: { c: 3 } } } as any);
    expect(Object.isFrozen(o)).toBe(true);
    expect(Object.isFrozen(o.nested)).toBe(true);
    expect(Object.isFrozen(o.nested.deeper)).toBe(true);
  });

  it('returns already-frozen object immediately without re-freezing', () => {
    const frozen = Object.freeze({ a: 1, nested: { b: 2 } });
    const freezeSpy = jest.spyOn(Object, 'freeze');
    const result = deepFreeze(frozen);
    expect(result).toBe(frozen);
    // No additional calls beyond the inner state we may inspect
    expect(freezeSpy).not.toHaveBeenCalled();
    freezeSpy.mockRestore();
  });

  it('handles cyclic references without stack overflow', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.self)).toBe(true);
  });

  it('handles cross-referenced cycles between two objects', () => {
    const a: any = { name: 'a' };
    const b: any = { name: 'b' };
    a.b = b;
    b.a = a;
    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(deepFreeze(null as any)).toBeNull();
    expect(deepFreeze(undefined as any)).toBeUndefined();
    expect(deepFreeze(42 as any)).toBe(42);
    expect(deepFreeze('hello' as any)).toBe('hello');
    expect(deepFreeze(true as any)).toBe(true);
  });

  it('freezes arrays and their nested object elements', () => {
    const arr = deepFreeze([{ a: 1 }, { b: { c: 2 } }] as any);
    expect(Object.isFrozen(arr)).toBe(true);
    expect(Object.isFrozen(arr[0])).toBe(true);
    expect(Object.isFrozen(arr[1].b)).toBe(true);
  });
});
