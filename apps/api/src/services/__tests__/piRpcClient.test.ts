import { describe, expect, it } from 'vitest';
import { buildPiRpcArgs } from '../piRpcClient';

describe('buildPiRpcArgs', () => {
  it('opens a task-owned JSONL file before the RPC session starts', () => {
    expect(buildPiRpcArgs({
      provider: 'openai',
      model: 'gpt-5',
      sessionPath: 'C:/runtime/sessions/task-42.jsonl',
      args: ['--no-tools'],
    })).toEqual([
      '--mode', 'rpc',
      '--provider', 'openai',
      '--model', 'gpt-5',
      '--session', 'C:/runtime/sessions/task-42.jsonl',
      '--session-dir', 'C:/runtime/sessions',
      '--no-tools',
    ]);
  });
});
