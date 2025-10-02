import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function runElectronMain(
  entryJs: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const electronPath = require('electron') as unknown as string;

    const child: ChildProcess = spawn(electronPath, [entryJs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString('utf8');
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString('utf8');
      });
    }

    child.on('close', (code: number | null) => {
      resolvePromise({ code: code ?? 0, stdout, stderr });
    });
  });
}

describe('Bitcoin Crawler: Desktop Add Blocks (sqlite)', () => {
  it('adds a couple of real blocks and exits with OK', async () => {
    const bootstrap = resolve(process.cwd(), 'src/desktop/bootstrap.cjs');
    const { code, stdout, stderr } = await runElectronMain(bootstrap);

    if (code !== 0) {
      // eslint-disable-next-line no-console
      console.error('STDERR:\n', stderr);
    }
    expect(code).toBe(0);

    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const last = lines[lines.length - 1]!;
    const result = JSON.parse(last);

    expect(result.ok).toBe(true);
    expect(result.network.blocksAddedEventsCount).toBeGreaterThanOrEqual(2);
    expect(result.user.blockEventsCount).toBeGreaterThanOrEqual(2);
  });
});
