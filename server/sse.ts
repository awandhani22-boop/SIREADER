/**
 * Authenticated, fixed-origin SSE proxy. Browser credentials are never forwarded;
 * only the server bearer and a strictly validated Last-Event-ID reach Python.
 */
import { Readable } from 'node:stream';
import type { Request, RequestHandler, Response } from 'express';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';
import { readServerToken, UPSTREAM_ORIGIN } from './upstream.ts';

export const SSE_UPSTREAM_PATH = '/api/v1/events/stream' as const;
export const SSE_CONNECT_TIMEOUT_MS = 5_000;
export const SSE_MAX_CONCURRENT_STREAMS = 4;

const LAST_EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]{0,18}$/;

export interface SseProxyOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly tokenProvider?: () => string | undefined;
  readonly connectTimeoutMs?: number;
  readonly maxConcurrentStreams?: number;
}

function fixedLoopbackOrigin(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid SSE upstream origin.');
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('SSE upstream must be a plain HTTP loopback origin.');
  }
  return parsed.origin;
}

function isEventStreamContentType(value: string | null): boolean {
  if (!value) return false;
  const parts = value.split(';').map((part) => part.trim().toLowerCase());
  if (parts.shift() !== 'text/event-stream') return false;
  return parts.every((part) => part === 'charset=utf-8');
}

function lastEventIdFromRequest(req: Request): string | undefined | null {
  const value = req.headers['last-event-id'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 80 || !LAST_EVENT_ID_PATTERN.test(value)) {
    return null;
  }
  return value;
}

function safeToken(provider: () => string | undefined): string | undefined {
  try {
    const value = provider();
    if (!value) return undefined;
    const token = value.trim();
    return token && /^[A-Za-z0-9._~+/-]+=*$/.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

export function createEventStreamProxyHandler(options: SseProxyOptions = {}): RequestHandler {
  const origin = fixedLoopbackOrigin(options.baseUrl ?? UPSTREAM_ORIGIN);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider ?? readServerToken;
  const timeoutMs = options.connectTimeoutMs ?? SSE_CONNECT_TIMEOUT_MS;
  const maxStreams = options.maxConcurrentStreams ?? SSE_MAX_CONCURRENT_STREAMS;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SSE_CONNECT_TIMEOUT_MS) {
    throw new Error('SSE connect timeout must be between 1 and 5000 milliseconds.');
  }
  if (!Number.isInteger(maxStreams) || maxStreams < 1 || maxStreams > SSE_MAX_CONCURRENT_STREAMS) {
    throw new Error('SSE concurrent stream limit must be between 1 and 4.');
  }

  const activeStreams = new Set<AbortController>();

  return async (req: Request, res: Response): Promise<void> => {
    const lastEventId = lastEventIdFromRequest(req);
    if (lastEventId === null) {
      sendBffError(res, 400, 'BAD_REQUEST', 'Last-Event-ID header is invalid.');
      return;
    }
    if (activeStreams.size >= maxStreams) {
      res.setHeader('Retry-After', '3');
      sendBffError(res, 503, 'BACKEND_ERROR', 'Event stream capacity is full.');
      return;
    }

    const token = safeToken(tokenProvider);
    if (!token) {
      SafeLogger.warn('SSE_UPSTREAM_AUTH_MISSING', {
        method: 'GET', route: SSE_UPSTREAM_PATH, statusCode: 503, errorCode: 'UPSTREAM_AUTH_FAILED',
      });
      sendBffError(res, 503, 'UPSTREAM_AUTH_FAILED', 'Backend authentication is not configured.');
      return;
    }

    const controller = new AbortController();
    activeStreams.add(controller);
    let released = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let bodyStream: Readable | undefined;

    const release = () => {
      if (released) return;
      released = true;
      if (connectTimer !== undefined) clearTimeout(connectTimer);
      activeStreams.delete(controller);
      req.off('aborted', onClientClose);
      res.off('close', onClientClose);
    };
    const onClientClose = () => {
      if (!res.writableEnded) {
        controller.abort();
        bodyStream?.destroy();
      }
      release();
    };

    req.once('aborted', onClientClose);
    res.once('close', onClientClose);

    try {
      const target = new URL(SSE_UPSTREAM_PATH, origin);
      const headers: Record<string, string> = {
        Authorization: 'Bearer ' + token,
        Accept: 'text/event-stream',
      };
      if (lastEventId !== undefined) headers['Last-Event-ID'] = lastEventId;

      connectTimer = setTimeout(() => controller.abort(), timeoutMs);
      const upstream = await fetchImpl(target, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(connectTimer);
      connectTimer = undefined;

      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel().catch(() => undefined);
        SafeLogger.warn('SSE_UPSTREAM_REDIRECT_REJECTED', {
          method: 'GET', route: SSE_UPSTREAM_PATH, statusCode: 502, errorCode: 'BACKEND_ERROR',
        });
        sendBffError(res, 502, 'BACKEND_ERROR', 'Backend returned an unsupported event-stream redirect.');
        release();
        return;
      }

      if (upstream.status !== 200 || !isEventStreamContentType(upstream.headers.get('content-type')) || !upstream.body) {
        await upstream.body?.cancel().catch(() => undefined);
        const authFailure = upstream.status === 401 || upstream.status === 403;
        SafeLogger.warn('SSE_UPSTREAM_REJECTED', {
          method: 'GET',
          route: SSE_UPSTREAM_PATH,
          statusCode: authFailure ? 502 : 503,
          errorCode: authFailure ? 'UPSTREAM_AUTH_FAILED' : 'BACKEND_ERROR',
        });
        sendBffError(
          res,
          authFailure ? 502 : 503,
          authFailure ? 'UPSTREAM_AUTH_FAILED' : 'BACKEND_ERROR',
          'Backend event stream is unavailable.',
        );
        release();
        return;
      }

      bodyStream = Readable.fromWeb(
        upstream.body as import('node:stream/web').ReadableStream<Uint8Array>,
      );
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.flushHeaders();

      bodyStream.once('error', () => {
        SafeLogger.warn('SSE_STREAM_INTERRUPTED', {
          method: 'GET', route: SSE_UPSTREAM_PATH, statusCode: 502, errorCode: 'UNREACHABLE',
        });
        if (!res.destroyed) res.destroy();
        release();
      });
      bodyStream.once('end', () => {
        if (!res.writableEnded && !res.destroyed) res.end();
        release();
      });
      bodyStream.once('close', () => {
        if (!bodyStream?.readableEnded && !res.writableEnded) {
          controller.abort();
          if (!res.destroyed) res.destroy();
        }
        release();
      });
      bodyStream.pipe(res);
    } catch (error) {
      if (connectTimer !== undefined) clearTimeout(connectTimer);
      if (controller.signal.aborted) {
        SafeLogger.warn('SSE_UPSTREAM_TIMEOUT', {
          method: 'GET', route: SSE_UPSTREAM_PATH, statusCode: 504, errorCode: 'TIMEOUT',
        });
        if (!res.headersSent) sendBffError(res, 504, 'TIMEOUT', 'Backend event stream connection timed out.');
      } else {
        SafeLogger.warn('SSE_UPSTREAM_UNREACHABLE', {
          method: 'GET', route: SSE_UPSTREAM_PATH, statusCode: 503, errorCode: 'UNREACHABLE',
        });
        if (!res.headersSent) sendBffError(res, 503, 'UNREACHABLE', 'Backend event stream is unavailable.');
      }
      release();
    }
  };
}
