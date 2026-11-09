/**
 * Same-origin browser client for the SIREADER BFF.
 *
 * The browser never receives the Python API bearer token. The BFF session cookie
 * is sent by the browser using credentials: same-origin. The CSRF token remains
 * in this client instance's memory closure and is never persisted or exposed.
 */
import {
  LiveContractError,
  LIVE_API_PATHS,
  parseAuthenticatedSession,
  parseBffErrorCode,
  parseLiveApiResponse,
  parseLoggedOut,
  parseWorkforceAttemptsResponse,
  parseWorkforceCommandResponse,
  type WorkforceCommandPath,
  type WorkforceCommandRequest,
  type WorkforceCommandResponseDto,
  type AuthenticatedSessionDto,
  type WorkforceAttemptsResponseDto,
  type WorkforceTasksResponseDto,
  type BffErrorCode,
  type LiveApiPath,
  type LiveApiResponseMap,
} from './live.contracts';

export const LIVE_API_TIMEOUT_MS = 5_000;

export type LiveApiErrorCode =
  | BffErrorCode
  | 'OFFLINE'
  | 'CSRF_MISSING'
  | 'UNEXPECTED_RESPONSE';

export class LiveApiError extends Error {
  readonly code: LiveApiErrorCode;

  constructor(code: LiveApiErrorCode) {
    super('LIVE API request failed: ' + code);
    this.name = 'LiveApiError';
    this.code = code;
  }
}

export interface LiveApiClient {
  getSession(): Promise<AuthenticatedSessionDto>;
  login(password: string): Promise<AuthenticatedSessionDto>;
  logout(): Promise<void>;
  get<K extends LiveApiPath>(path: K): Promise<LiveApiResponseMap[K]>;
  getWorkforceAttempts(taskId: string): Promise<WorkforceAttemptsResponseDto>;
  getWorkforceTasks(limit?: number, offset?: number): Promise<WorkforceTasksResponseDto>;
  sendWorkforceCommand(path: WorkforceCommandPath, request: WorkforceCommandRequest): Promise<WorkforceCommandResponseDto>;
  clearCsrfToken(): void;
}

export interface LiveApiClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly idempotencyKeyFactory?: () => string;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

function hasJsonContentType(response: Response): boolean {
  const raw = response.headers.get('content-type') ?? '';
  return raw.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

async function readErrorCode(response: Response): Promise<BffErrorCode | null> {
  if (!hasJsonContentType(response)) return null;
  try {
    return parseBffErrorCode(await response.json());
  } catch {
    return null;
  }
}

function mapHttpFailure(status: number, code: BffErrorCode | null): LiveApiError {
  if (code) return new LiveApiError(code);
  if (status === 401) return new LiveApiError('SESSION_REQUIRED');
  if (status === 429) return new LiveApiError('RATE_LIMITED');
  if (status === 503) return new LiveApiError('AUTH_NOT_CONFIGURED');
  return new LiveApiError('BACKEND_ERROR');
}

export function createLiveApiClient(options: LiveApiClientOptions = {}): LiveApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? LIVE_API_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LIVE_API_TIMEOUT_MS) {
    throw new Error('LIVE API timeout must be between 1 and 5000 milliseconds.');
  }

  let csrfToken: string | null = null;

  async function request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(path, {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (timedOut || controller.signal.aborted) throw new LiveApiError('TIMEOUT');
      return response;
    } catch (error) {
      if (error instanceof LiveApiError) throw error;
      if (timedOut || isAbortError(error)) throw new LiveApiError('TIMEOUT');
      throw new LiveApiError('OFFLINE');
    } finally {
      clearTimeout(timer);
    }
  }

  async function requireSuccess(response: Response): Promise<void> {
    if (response.ok) return;
    const code = await readErrorCode(response);
    throw mapHttpFailure(response.status, code);
  }

  async function readSuccessfulJson(response: Response): Promise<unknown> {
    if (!hasJsonContentType(response)) throw new LiveApiError('UNEXPECTED_RESPONSE');
    try {
      return await response.json() as unknown;
    } catch {
      throw new LiveApiError('SCHEMA_INVALID');
    }
  }

  async function readSessionResponse(response: Response): Promise<AuthenticatedSessionDto> {
    await requireSuccess(response);
    try {
      return parseAuthenticatedSession(await readSuccessfulJson(response));
    } catch (error) {
      if (error instanceof LiveApiError) throw error;
      if (error instanceof LiveContractError) throw new LiveApiError('SCHEMA_INVALID');
      throw new LiveApiError('SCHEMA_INVALID');
    }
  }

  return {
    async getSession(): Promise<AuthenticatedSessionDto> {
      try {
        const response = await request('/api/auth/session', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const session = await readSessionResponse(response);
        csrfToken = session.csrfToken;
        return session;
      } catch (error) {
        if (error instanceof LiveApiError && error.code === 'SESSION_REQUIRED') csrfToken = null;
        throw error;
      }
    },

    async login(password: string): Promise<AuthenticatedSessionDto> {
      csrfToken = null;
      if (typeof password !== 'string' || password.length < 1 || new TextEncoder().encode(password).byteLength > 256) {
        throw new LiveApiError('BAD_REQUEST');
      }
      const response = await request('/api/auth/login', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      const session = await readSessionResponse(response);
      csrfToken = session.csrfToken;
      return session;
    },

    async logout(): Promise<void> {
      if (!csrfToken) throw new LiveApiError('CSRF_MISSING');
      const currentCsrf = csrfToken;
      try {
        const response = await request('/api/auth/logout', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-Token': currentCsrf,
          },
          body: '{}',
        });
        await requireSuccess(response);
        try {
          parseLoggedOut(await readSuccessfulJson(response));
        } catch {
          throw new LiveApiError('SCHEMA_INVALID');
        }
        csrfToken = null;
      } catch (error) {
        if (
          error instanceof LiveApiError &&
          (error.code === 'SESSION_REQUIRED' || error.code === 'CSRF_INVALID')
        ) csrfToken = null;
        throw error;
      }
    },

    async get<K extends LiveApiPath>(path: K): Promise<LiveApiResponseMap[K]> {
      if (!(LIVE_API_PATHS as readonly string[]).includes(path)) {
        throw new LiveApiError('NOT_FOUND');
      }
      try {
        const response = await request(path, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        await requireSuccess(response);
        let payload: unknown;
        try {
          payload = await readSuccessfulJson(response);
        } catch (error) {
          if (error instanceof LiveApiError) throw error;
          throw new LiveApiError('SCHEMA_INVALID');
        }
        try {
          return parseLiveApiResponse(path, payload);
        } catch {
          throw new LiveApiError('SCHEMA_INVALID');
        }
      } catch (error) {
        if (error instanceof LiveApiError && error.code === 'SESSION_REQUIRED') csrfToken = null;
        throw error;
      }
    },

    async getWorkforceTasks(limit = 50, offset = 0): Promise<WorkforceTasksResponseDto> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
        throw new LiveApiError('BAD_REQUEST');
      }
      try {
        const response = await request(
          '/api/v1/workforce/tasks?limit=' + limit + '&offset=' + offset,
          { method: 'GET', headers: { Accept: 'application/json' } },
        );
        await requireSuccess(response);
        const payload = await readSuccessfulJson(response);
        try {
          return parseLiveApiResponse('/api/v1/workforce/tasks', payload) as WorkforceTasksResponseDto;
        } catch {
          throw new LiveApiError('SCHEMA_INVALID');
        }
      } catch (error) {
        if (error instanceof LiveApiError && error.code === 'SESSION_REQUIRED') csrfToken = null;
        throw error;
      }
    },


    async sendWorkforceCommand(
      path: WorkforceCommandPath,
      command: WorkforceCommandRequest,
    ): Promise<WorkforceCommandResponseDto> {
      if (!csrfToken) throw new LiveApiError('CSRF_MISSING');
      const idempotencyKey = idempotencyKeyFactory();
      if (!/^[A-Za-z0-9._~-]{8,128}$/.test(idempotencyKey)) throw new LiveApiError('BAD_REQUEST');
      if (![
        '/api/v1/commands/tasks/enqueue',
        '/api/v1/commands/tasks/cancel',
        '/api/v1/commands/tasks/retry',
        '/api/v1/commands/workers/scheduling',
      ].includes(path)) throw new LiveApiError('NOT_FOUND');
      try {
        const response = await request(path, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(command),
        });
        await requireSuccess(response);
        const payload = await readSuccessfulJson(response);
        try {
          return parseWorkforceCommandResponse(payload, path, command);
        } catch {
          throw new LiveApiError('SCHEMA_INVALID');
        }
      } catch (error) {
        if (error instanceof LiveApiError && (
          error.code === 'SESSION_REQUIRED' || error.code === 'CSRF_INVALID'
        )) csrfToken = null;
        throw error;
      }
    },

    async getWorkforceAttempts(taskId: string): Promise<WorkforceAttemptsResponseDto> {
      if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(taskId)) {
        throw new LiveApiError('BAD_REQUEST');
      }
      try {
        const response = await request(
          '/api/v1/workforce/attempts?task_id=' + encodeURIComponent(taskId),
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
          },
        );
        await requireSuccess(response);
        const payload = await readSuccessfulJson(response);
        try {
          return parseWorkforceAttemptsResponse(payload, taskId);
        } catch {
          throw new LiveApiError('SCHEMA_INVALID');
        }
      } catch (error) {
        if (error instanceof LiveApiError && error.code === 'SESSION_REQUIRED') csrfToken = null;
        throw error;
      }
    },

    clearCsrfToken(): void {
      csrfToken = null;
    },
  };
}
