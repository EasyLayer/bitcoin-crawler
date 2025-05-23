# Environment Variable Conventions

This guide explains how our config classes handle env vars, optionality, defaults, and transforms—especially noting that.

## 1. Presence vs. Absence of an env var

- **Env var set (including empty string)**: raw `process.env.VAR_NAME` is present, so `@Transform` receives `value` (even `''`).
- **Env var absent (`undefined`)**: the input object lacks the key entirely, so `@Transform` is **skipped** and the field remains at its initializer (or `undefined`).

> 💡 By default, `class-transformer` only applies `@Transform` when the source object contains that key. If you need transforms on missing keys, supply a default via initializer or enable `exposeDefaultValues`.

```ts
class Config {
  @Transform(({value}) => value ?? 'def')
  @IsString()
  HOST?: string = 'def';
}

// 1) { HOST: 'a' } → transform('a') → 'a'
// 2) { HOST: '' }  → transform('')  → ''
// 3) {}           → no key → no transform → initializer 'def'
```

---

## 2. Required vs Optional (`!` vs `?`)

| Modifier | Decorator      | Behavior when key is missing                  |
|----------|----------------|-----------------------------------------------|
| `!`      | *none*         | Missing → validation error (`@Is*`)           |
| `?`      | `@IsOptional()`| Missing → allowed, yields `undefined`         |
| `?`      | *no `@IsOptional()`* | Missing → validation error                  |

```ts
// Required → must appear in env
class ReqConfig {
  @IsString()
  REQUIRED!: string;
}

// Optional → may be missing
class OptConfig {
  @IsString()
  @IsOptional()
  MAYBE?: string;
}
```

---

## 3. Transform + Initializer + Optionality

| Pattern                        | Example                                                        | Missing key result | Empty string result | Invalid result      |
|--------------------------------|----------------------------------------------------------------|--------------------|---------------------|---------------------|
| **Transform + initializer**    | `value ?? 'def'`, `= 'def'`                                    | `'def'`            | `''`                | `''`                |
| **parseInt fallback**          | `parseInt(v)||3000`, `=3000`                                   | `3000`             | `3000` (`parseInt('')` → `NaN`) | `3000`  |
| **Optional transform + @Optional**| `value??100`, `@IsOptional()`                            | `undefined`        | `''` (invalid for number)        | `100`              |

- **Initializer** runs before transforms/validation and sets the field on missing-key.  
- **Transform** runs only if the source object has that key.  
- **@IsOptional()** allows `undefined` without error.

---

## 4. Common Scenarios

1. **Optional string with default**
   ```ts
   @Transform(({v})=>v??'x')
   @IsString()
   @IsOptional()
   HOST?: string = 'x';
   ```
   - `{}` → initializer `'x'`; transform skipped.  
   - `{HOST:''}` → transform `''`; result `''`.  
   - `{HOST:'h'}` → `h`.

2. **Optional number with default fallback**
   ```ts
   @Transform(({v})=>parseInt(v)||42)
   @IsNumber()
   @IsOptional()
   PORT?: number;
   ```
   - `{}` → no transform → `undefined` (allowed).  
   - `{PORT:''}` → transform→`NaN||42`→`42`.  
   - `{PORT:'10'}`→`10`.

3. **Required value**
   ```ts
   @Transform(({v})=>v)
   @IsString()
   REQUIRED!: string;
   ```
   - `{}` → missing → validation error.  
   - `{REQUIRED:''}` → `''` (allowed).  
   - `{REQUIRED:'ok'}` → `ok`.

---

**TL;DR**: Always pair optional (`?`) with `@IsOptional()` if you want to allow missing keys. Use a property initializer for defaults on **completely missing** keys. And remember: `@Transform` only runs when the key exists in the input object.

