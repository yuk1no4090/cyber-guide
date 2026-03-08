import type { Stream } from 'openai/streaming';
import type OpenAI from 'openai';

export interface NDJSONDelta {
  t: 'delta';
  c: string;
}

export interface NDJSONMeta {
  t: 'meta';
  message: string;
  suggestions: string[];
  isCrisis?: boolean;
  isReport?: boolean;
  scenario?: string | null;
  promptVersion?: string;
  [key: string]: unknown;
}

export interface NDJSONError {
  t: 'error';
  message: string;
}

export type NDJSONLine = NDJSONDelta | NDJSONMeta | NDJSONError;

const ENCODER = new TextEncoder();

function encodeLine(obj: NDJSONLine): Uint8Array {
  return ENCODER.encode(JSON.stringify(obj) + '\n');
}

type ChatStream = Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

/**
 * 给异步迭代器加 chunk 级超时：如果两个 chunk 之间超过 timeoutMs 没有数据，抛出超时错误。
 */
async function* withChunkTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Stream chunk timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    if (result.done) break;
    yield result.value;
  }
}

/**
 * Pipe an OpenAI streaming completion into a NDJSON ReadableStream.
 *
 * @param stream  - OpenAI chat completion stream (stream: true)
 * @param buildMeta - Called with full accumulated text; returns the meta payload to send as last line
 * @param requestId - For logging
 * @param chunkTimeoutMs - Max ms to wait between chunks before aborting (default 30s)
 */
export function openaiStreamToNDJSON(
  stream: ChatStream,
  buildMeta: (fullText: string) => Omit<NDJSONMeta, 't'> | Partial<Omit<NDJSONMeta, 't'>>,
  requestId: string,
  chunkTimeoutMs = 30_000,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = '';
      try {
        for await (const chunk of withChunkTimeout(stream, chunkTimeoutMs)) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            controller.enqueue(encodeLine({ t: 'delta', c: delta }));
          }
        }

        const metaFields = buildMeta(accumulated);
        const message = typeof metaFields.message === 'string' ? metaFields.message : accumulated;
        const suggestions = Array.isArray(metaFields.suggestions) ? metaFields.suggestions : [];
        const meta: NDJSONMeta = {
          t: 'meta',
          message,
          suggestions,
          ...metaFields,
        };
        controller.enqueue(encodeLine(meta));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream interrupted';
        console.error(`[${requestId}] stream error:`, err);
        try {
          controller.enqueue(encodeLine({ t: 'error', message: msg }));
        } catch { /* controller may already be closed */ }
        controller.close();
      }
    },

    cancel() {
      stream.controller.abort();
    },
  });
}

/**
 * Build a Next.js Response from a NDJSON ReadableStream.
 */
export function ndjsonResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
