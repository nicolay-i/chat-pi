import EventSource, {
  type EventSourceListener,
  type EventSourceOptions,
} from 'react-native-sse';
import { RealtimeEnvelopeSchema, type RealtimeEnvelope } from '@pi-agents/contracts';

type EventStreamOptions = {
  url: string;
  afterSequence?: number;
  onEvent: (event: RealtimeEnvelope) => void;
  onStateChange?: (state: 'connecting' | 'open' | 'closed' | 'error') => void;
};

type NativeEventSource = Pick<
  EventSource,
  'addEventListener' | 'removeEventListener' | 'close'
>;

export type NativeEventSourceFactory = (
  url: string,
  options: EventSourceOptions,
) => NativeEventSource;

export function connectEventStream(options: EventStreamOptions) {
  return connectNativeEventStream(options, (url, sourceOptions) => new EventSource(url, sourceOptions));
}

export function connectNativeEventStream(
  options: EventStreamOptions,
  createEventSource: NativeEventSourceFactory,
) {
  const url = options.afterSequence === undefined
    ? options.url
    : `${options.url}?afterSequence=${encodeURIComponent(options.afterSequence)}`;
  options.onStateChange?.('connecting');

  // RealtimeManager owns reconnects and sequence replay, so disable the
  // library's independent polling loop.
  const source = createEventSource(url, { pollingInterval: 0, timeoutBeforeConnection: 0 });
  const onOpen: EventSourceListener = () => options.onStateChange?.('open');
  const onError: EventSourceListener = () => options.onStateChange?.('error');
  const onMessage: EventSourceListener = (message) => {
    if (message.type !== 'message' || typeof message.data !== 'string') return;
    try {
      options.onEvent(RealtimeEnvelopeSchema.parse(JSON.parse(message.data)));
    } catch {
      options.onStateChange?.('error');
    }
  };

  source.addEventListener('open', onOpen);
  source.addEventListener('error', onError);
  source.addEventListener('message', onMessage);

  return () => {
    source.removeEventListener('open', onOpen);
    source.removeEventListener('error', onError);
    source.removeEventListener('message', onMessage);
    source.close();
    options.onStateChange?.('closed');
  };
}
