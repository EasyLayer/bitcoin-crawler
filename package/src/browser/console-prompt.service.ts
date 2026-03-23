// Browser stub for ConsolePromptService.
// In the browser there is no stdin/stdout — all confirmations auto-resolve to true.
// This keeps the DI token satisfied without pulling in readline (Node-only).
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsolePromptService {
  log = new Logger(ConsolePromptService.name);

  async askUserConfirmation(_message: string): Promise<boolean> {
    // No interactive prompt in browser — always confirm
    return true;
  }

  async askDataResetConfirmation(configStartHeight: number, currentDbHeight: number): Promise<boolean> {
    this.log.warn(
      `Data reset: configuredStart=${configStartHeight}, currentDb=${currentDbHeight} — auto-confirming in browser`
    );
    return true;
  }
}
