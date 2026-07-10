import type { RealtimeEnvelope } from '@pi-agents/contracts';

export function formatSseEvent(env: RealtimeEnvelope): string {
  return `data: ${JSON.stringify(env)}\n\n`;
}

export interface ToSseResponseInput {
  replay: RealtimeEnvelope[];
  subscribe: (onChange: (env: RealtimeEnvelope) => void) => () => void;
}

export function toSseResponse({ replay, subscribe }: ToSseResponseInput): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const env of replay) {
        controller.enqueue(encoder.encode(formatSseEvent(env)));
      }
      unsubscribe = subscribe((env) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(env)));
        } catch {
          unsubscribe?.();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
