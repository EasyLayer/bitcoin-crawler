import 'reflect-metadata';
import { transformAndValidate } from 'class-transformer-validator';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

type Env = Record<string, any>;

describe('Environment Variable Scenarios', () => {
  // 2) Optional '?', with transform default, no @IsOptional
  class Case2_Config {
    @Transform(({ value }) => (value?.length ? value : 'x-host'))
    @IsString()
    HOST?: string;
  }

  it('Case2: HOST? with transform uses provided empty or value', async () => {
    let cfg = (await transformAndValidate(
      Case2_Config,
      { HOST: '' } as Env
    )) as Case2_Config;
    expect(cfg.HOST).toBe('x-host');

    cfg = (await transformAndValidate(
      Case2_Config,
      { HOST: 'custom' } as Env
    )) as Case2_Config;
    expect(cfg.HOST).toBe('custom');
  });

  // 3) Optional '?', no transform, with @IsOptional
  class Case3_Config {
    @IsString()
    @IsOptional()
    HOST?: string;
  }

  it('Case3: HOST? with @IsOptional but no transform remains undefined when unset', async () => {
    const cfg = (await transformAndValidate(
      Case3_Config,
      {} as Env
    )) as Case3_Config;
    expect(cfg.HOST).toBeUndefined();
  });

  it('Case3: HOST? with @IsOptional accepts empty string or value', async () => {
    let cfg = (await transformAndValidate(
      Case3_Config,
      { HOST: '' } as Env
    )) as Case3_Config;
    expect(cfg.HOST).toBe('');

    cfg = (await transformAndValidate(
      Case3_Config,
      { HOST: 'h' } as Env
    )) as Case3_Config;
    expect(cfg.HOST).toBe('h');
  });

  // 4) Numeric parse scenarios
  class Case4_Config {
    @Transform(({ value }) => {
        const n = parseInt(value, 10);
        return n === 0 ? 0 : (n || 999);
    })
    @IsNumber()
    PORT: number = 999;
  }

  it('Case4: parseInt fallback when unset/invalid/zero', async () => {
    let cfg = (await transformAndValidate(
      Case4_Config,
      {} as Env
    )) as Case4_Config;
    expect(cfg.PORT).toBe(999);

    cfg = (await transformAndValidate(
      Case4_Config,
      { PORT: '0' } as Env
    )) as Case4_Config;
    expect(cfg.PORT).toBe(0);

    cfg = (await transformAndValidate(
      Case4_Config,
      { PORT: 'abc' } as Env
    )) as Case4_Config;
    expect(cfg.PORT).toBe(999);
  });

  it('Case4: parseInt uses valid numeric string', async () => {
    const cfg = (await transformAndValidate(
      Case4_Config,
      { PORT: '1234' } as Env
    )) as Case4_Config;
    expect(cfg.PORT).toBe(1234);
  });

  // 6) Optional number with transform default, with @IsOptional
  class Case6_Config {
    @Transform(({ value }) => parseInt(value, 10) || 2020)
    @IsNumber()
    @IsOptional()
    PORT?: number;
  }

  it('Case6: PORT? with transform default when unset', async () => {
    const cfg = (await transformAndValidate(
      Case6_Config,
      {} as Env
    )) as Case6_Config;
    expect(cfg.PORT).toBeUndefined();
  });

  // 7) PORT? transform + provided value
  it('Case6: PORT? transform uses provided number', async () => {
    const cfg = (await transformAndValidate(
      Case6_Config,
      { PORT: '5555' } as Env
    )) as Case6_Config;
    expect(cfg.PORT).toBe(5555);
  });
});
