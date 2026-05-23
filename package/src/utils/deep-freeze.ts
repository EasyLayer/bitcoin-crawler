export function deepFreeze<T>(obj: T, seen: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  if (seen.has(obj as object)) return obj;
  seen.add(obj as object);

  Object.getOwnPropertyNames(obj).forEach((name) => {
    const value = (obj as any)[name];
    if (value && typeof value === 'object') {
      deepFreeze(value, seen);
    }
  });
  return Object.freeze(obj);
}
