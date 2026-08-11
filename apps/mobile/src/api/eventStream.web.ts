import { RealtimeEnvelopeSchema, type RealtimeEnvelope } from '@pi-agents/contracts';

type EventStreamOptions = {
  url: string;
  afterSequence?: number;
  headers?: Record<string, string>;
  onEvent: (event: RealtimeEnvelope) => void;
  onStateChange?: (state: 'connecting' | 'open' | 'closed' | 'error') => void;
};

export function connectEventStream(options: EventStreamOptions) {
  const url = options.afterSequence === undefined
    ? options.url
    : `${options.url}?afterSequence=${encodeURIComponent(options.afterSequence)}`;
  options.onStateChange?.('connecting');
  const controller = new AbortController();
  let stopped = false;
  // EventSource cannot send Authorization headers. Fetch streaming keeps the
  // token out of the URL and works for anonymous connections as well.
  void (async () => {
    try {
      const response = await fetch(url, { headers: options.headers, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`SSE request failed: ${response.status}`);
      options.onStateChange?.('open');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          options.onEvent(RealtimeEnvelopeSchema.parse(JSON.parse(data)));
        }
      }
      if (!stopped) options.onStateChange?.('error');
    } catch {
      if (!stopped) options.onStateChange?.('error');
    }
  })();
  return () => {
    stopped = true;
    controller.abort();
    options.onStateChange?.('closed');
  };
}
