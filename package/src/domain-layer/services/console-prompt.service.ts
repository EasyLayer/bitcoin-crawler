import { Injectable } from '@nestjs/common';
import * as readline from 'readline';
import { AppLogger } from '@easylayer/common/logger';

@Injectable()
export class ConsolePromptService {
  constructor(private readonly log: AppLogger) {}

  private createReadlineInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async askUserConfirmation(message: string): Promise<boolean> {
    const rl = this.createReadlineInterface();

    return new Promise((resolve) => {
      const askQuestion = () => {
        rl.question(`${message} (yes/no): `, (answer) => {
          const normalizedAnswer = answer.toLowerCase().trim();

          if (normalizedAnswer === 'yes' || normalizedAnswer === 'y') {
            rl.close();
            resolve(true);
          } else if (normalizedAnswer === 'no' || normalizedAnswer === 'n') {
            rl.close();
            resolve(false);
          } else {
            this.log.warn('Please enter "yes" or "no"');
            askQuestion(); // Ask again
          }
        });
      };

      askQuestion();
    });
  }

  async askDataResetConfirmation(configStartHeight: number, currentDbHeight: number): Promise<boolean> {
    this.log.warn('\n⚠️  WARNING: Data Reset Required ⚠️');
    this.log.warn('═'.repeat(50));
    this.log.warn(`Configured start block: ${configStartHeight}`);
    this.log.warn(`Current database block: ${currentDbHeight}`);
    this.log.warn('This operation will DELETE all existing blockchain data.');
    this.log.warn('═'.repeat(50));

    return this.askUserConfirmation('\nDo you want to proceed with data reset?');
  }
}
