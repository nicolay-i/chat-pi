import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { PiRpcClientOptions } from '../../services/piRpcClient';

const directory = dirname(fileURLToPath(import.meta.url));

export class FakePiRpcProcess {
  static options(input: { cwd: string; sessionPath: string }): PiRpcClientOptions {
    return {
      nodeBin: process.execPath,
      piBin: join(directory, 'fakePiRpcChild.mjs'),
      cwd: input.cwd,
      env: { FAKE_PI_SESSION_PATH: input.sessionPath },
    };
  }
}
