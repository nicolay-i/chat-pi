import { RealtimeEnvelopeSchema, type RealtimeEnvelope } from '@pi-agents/contracts';

type EventStreamOptions = {
  url: string;
  after?: string;
  onEvent: (event: RealtimeEnvelope) => void;
  onStateChange?: (state: 'connecting' | 'open' | 'closed' | 'error') => void;
};

export function connectEventStream(options: EventStreamOptions) {
  const url = options.after ? `${options.url}?after=${encodeURIComponent(options.after)}` : options.url;
  options.onStateChange?.('connecting');
  const source = new EventSource(url);
  source.onopen = () => options.onStateChange?.('open');
  source.onerror = () => options.onStateChange?.('error');
  source.onmessage = (message) => {
    const parsed = RealtimeEnvelopeSchema.parse(JSON.parse(message.data));
    options.onEvent(parsed);
  };
  return () => {
    source.close();
    options.onStateChange?.('closed');
  };
}
