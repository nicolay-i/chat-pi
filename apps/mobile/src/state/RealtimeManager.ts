import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { connectEventStream } from '../api/eventStream';

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

export type RealtimeManagerOptions = {
  url: string;
  initialAfterSequence?: number | null;
  maxReconnectAttempts?: number;
  onEvent: (event: RealtimeEnvelope) => void;
  onState?: (state: RealtimeState) => void;
  // Test seam: inject a fake transport. Defaults to the real connectEventStream.
  connect?: typeof connectEventStream;
  // Test seam: inject a scheduler so tests can avoid real timers.
  schedule?: (fn: () => void, ms: number) => () => void;
};

export const BASE_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 10_000;

export function computeBackoffMs(attempt: number): number {
  if (attempt <= 0) return BASE_BACKOFF_MS;
  const raw = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.min(raw, MAX_BACKOFF_MS);
}

type CloseFn = () => void;

export class RealtimeManager {
  private lastSequence: number | null;
  private state: RealtimeState = 'idle';
  private closeFn: CloseFn | null = null;
  private reconnectAttempts = 0;
  private reconnectCancel: (() => void) | null = null;
  private started = false;

  private readonly url: string;
  private readonly maxReconnectAttempts: number;
  private readonly onEvent: (event: RealtimeEnvelope) => void;
  private readonly onState?: (state: RealtimeState) => void;
  private readonly connect: typeof connectEventStream;
  private readonly schedule: (fn: () => void, ms: number) => () => void;

  constructor(options: RealtimeManagerOptions) {
    this.url = options.url;
    this.lastSequence = options.initialAfterSequence ?? null;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.onEvent = options.onEvent;
    this.onState = options.onState;
    this.connect = options.connect ?? connectEventStream;
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      });
  }

  getLastSequence(): number | null {
    return this.lastSequence;
  }

  getState(): RealtimeState {
    return this.state;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.openStream();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectCancel) {
      this.reconnectCancel();
      this.reconnectCancel = null;
    }
    if (this.closeFn) {
      this.closeFn();
      this.closeFn = null;
    }
    this.setState('idle');
  }

  private setState(next: RealtimeState): void {
    if (this.state === next) return;
    this.state = next;
    this.onState?.(next);
  }

  private openStream(): void {
    this.setState('connecting');
    const close = this.connect({
      url: this.url,
      afterSequence: this.lastSequence ?? undefined,
      onEvent: (event) => {
        if (this.lastSequence === null || event.sequence > this.lastSequence) {
          this.lastSequence = event.sequence;
        }
        this.onEvent(event);
      },
      onStateChange: (s) => {
        if (s === 'open') {
          this.reconnectAttempts = 0;
          this.setState('open');
        } else if (s === 'connecting') {
          if (this.state !== 'reconnecting') {
            this.setState('connecting');
          }
        } else if (s === 'error') {
          this.handleDisconnect();
        } else if (s === 'closed') {
          if (this.started && this.state !== 'reconnecting' && this.state !== 'error') {
            this.handleDisconnect();
          }
        }
      },
    });
    this.closeFn = close;
  }

  private handleDisconnect(): void {
    if (!this.started) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('error');
      return;
    }
    this.setState('reconnecting');
    const attempt = this.reconnectAttempts;
    this.reconnectAttempts += 1;
    const delay = computeBackoffMs(attempt);
    if (this.reconnectCancel) {
      this.reconnectCancel();
    }
    this.reconnectCancel = this.schedule(() => {
      this.reconnectCancel = null;
      if (!this.started) return;
      if (this.closeFn) {
        this.closeFn();
        this.closeFn = null;
      }
      this.openStream();
    }, delay);
  }
}
