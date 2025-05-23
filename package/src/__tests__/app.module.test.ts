import { Test, TestingModule } from '@nestjs/testing';
import { BitcoinAppModule } from '../app.module';

describe('BitcoinAppModule', () => {
  let bitcoinAppModule: BitcoinAppModule;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [BitcoinAppModule],
    }).compile();

    bitcoinAppModule = module.get<BitcoinAppModule>(BitcoinAppModule);
  });

  it('should be defined', () => {
    expect(bitcoinAppModule).toBeDefined();
  });
});
