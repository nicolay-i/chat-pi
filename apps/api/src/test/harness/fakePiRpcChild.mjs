const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
let sessionPath = process.env.FAKE_PI_SESSION_PATH ?? `${process.cwd()}/session.jsonl`;

for await (const chunk of process.stdin) {
  for (const line of chunk.toString('utf8').split(/\r?\n/)) {
    if (!line) continue;
    let command;
    try { command = JSON.parse(line); } catch { continue; }
    const response = (success = true, extra = {}) => send({ type: 'response', id: command.id, success, ...extra });
    if (command.type === 'get_state') {
      response(true, { cwd: process.cwd(), sessionPath });
    } else if (command.type === 'switch_session') {
      sessionPath = command.sessionPath;
      response();
    } else if (command.type === 'fail') {
      response(false, { error: 'fake runtime failure' });
    } else if (command.type === 'prompt') {
      response();
      setTimeout(() => {
        send({ type: 'agent_start' });
        send({ type: 'message_start', message: { role: 'assistant', content: [] } });
        send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: `done: ${command.message}` } });
        send({ type: 'tool_call', tool: 'fake_tool', args: { cwd: process.cwd() } });
        send({ type: 'tool_result', tool: 'fake_tool', output: 'ok', status: 'completed' });
        send({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: `done: ${command.message}` }] } });
        send({ type: 'agent_end' });
      }, 10);
    } else if (command.type === 'steer' || command.type === 'follow_up' || command.type === 'abort' || command.type === 'new_session' || command.type === 'fork' || command.type === 'get_entries') {
      response();
      if (command.type === 'abort') setTimeout(() => send({ type: 'agent_end' }), 5);
    } else {
      response(false, { error: `unsupported command: ${command.type}` });
    }
  }
}
