/**
 * Independent LIVE observability state.
 *
 * This store deliberately does not import, mutate, or derive values from the
 * deterministic simulation store. LIVE data is only written after validated
 * same-origin BFF responses and always carries explicit LIVE provenance.
 */
import { create } from 'zustand';
import type { LiveApiErrorCode } from './live.api';
import {
  LIVE_API_PATHS,
  type LiveApiPath,
  type LiveApiResponseMap,
} from './live.contracts';

export type LiveConnectionState =
  | 'CONNECTING'
  | 'LIVE'
  | 'STALE'
  | 'OFFLINE'
  | 'ERROR'
  | 'SESSION_REQUIRED';

export type LiveSessionState = 'UNKNOWN' | 'AUTHENTICATED' | 'UNAUTHENTICATED';
export type LiveResourceStatus = 'IDLE' | 'LOADING' | 'LIVE' | 'STALE' | 'ERROR';

export interface LiveResourceSnapshot<T> {
  readonly status: LiveResourceStatus;
  readonly source: 'LIVE' | null;
  readonly data: T | null;
  readonly fetchedAt: number | null;
  readonly error: LiveApiErrorCode | null;
}

export type LiveResources = {
  readonly [K in LiveApiPath]: LiveResourceSnapshot<LiveApiResponseMap[K]>;
};

function emptyResource<T>(): LiveResourceSnapshot<T> {
  return {
    status: 'IDLE',
    source: null,
    data: null,
    fetchedAt: null,
    error: null,
  };
}

export function createEmptyLiveResources(): LiveResources {
  return {
    '/api/v1/system/status': emptyResource(),
    '/api/v1/telemetry/usage': emptyResource(),
    '/api/v1/pipeline/active': emptyResource(),
    '/api/v1/market-watches/active': emptyResource(),
    '/api/v1/audit/decisions': emptyResource(),
  };
}

export interface LiveStoreState {
  readonly connection: LiveConnectionState;
  readonly session: LiveSessionState;
  readonly resources: LiveResources;
  setConnection: (connection: LiveConnectionState) => void;
  setSession: (session: LiveSessionState) => void;
  setResourceLoading: (path: LiveApiPath) => void;
  setResourceSuccess: <K extends LiveApiPath>(
    path: K,
    data: LiveApiResponseMap[K],
    fetchedAt?: number,
  ) => void;
  setResourceError: (path: LiveApiPath, error: LiveApiErrorCode) => void;
  restoreResourceAfterTransportFailure: (path: LiveApiPath, previousStatus: LiveResourceStatus, error: LiveApiErrorCode) => void;
  markResourceStale: (path: LiveApiPath, expectedFetchedAt: number) => void;
  clearPrivateLiveData: () => void;
  reset: () => void;
}

const initialState = {
  connection: 'CONNECTING' as const,
  session: 'UNKNOWN' as const,
  resources: createEmptyLiveResources(),
};

export const useLiveStore = create<LiveStoreState>((set) => ({
  ...initialState,

  setConnection: (connection) => set({ connection }),
  setSession: (session) => set({ session }),

  setResourceLoading: (path) => set((state) => ({
    resources: {
      ...state.resources,
      [path]: {
        ...state.resources[path],
        status: 'LOADING',
        error: null,
      },
    } as LiveResources,
  })),

  setResourceSuccess: (path, data, fetchedAt = Date.now()) => set((state) => ({
    connection: 'LIVE',
    resources: {
      ...state.resources,
      [path]: {
        status: 'LIVE',
        source: 'LIVE',
        data,
        fetchedAt,
        error: null,
      },
    } as LiveResources,
  })),

  setResourceError: (path, error) => set((state) => ({
    resources: {
      ...state.resources,
      [path]: {
        ...state.resources[path],
        status: 'ERROR',
        error,
      },
    } as LiveResources,
  })),

  restoreResourceAfterTransportFailure: (path, previousStatus, error) => set((state) => {
    const current = state.resources[path];
    const restoredStatus: LiveResourceStatus = current.data === null
      ? 'IDLE'
      : previousStatus === 'LOADING' || previousStatus === 'IDLE'
        ? 'LIVE'
        : previousStatus;
    return {
      resources: {
        ...state.resources,
        [path]: { ...current, status: restoredStatus, error },
      } as LiveResources,
    };
  }),

  markResourceStale: (path, expectedFetchedAt) => set((state) => {
    const current = state.resources[path];
    if (current.data === null || current.fetchedAt !== expectedFetchedAt || current.status !== 'LIVE') {
      return state;
    }
    return {
      resources: {
        ...state.resources,
        [path]: { ...current, status: 'STALE' },
      } as LiveResources,
    };
  }),

  clearPrivateLiveData: () => set({
    connection: 'SESSION_REQUIRED',
    session: 'UNAUTHENTICATED',
    resources: createEmptyLiveResources(),
  }),

  reset: () => set({
    connection: initialState.connection,
    session: initialState.session,
    resources: createEmptyLiveResources(),
  }),
}));

export function isLiveApiPath(value: string): value is LiveApiPath {
  return (LIVE_API_PATHS as readonly string[]).includes(value);
}
