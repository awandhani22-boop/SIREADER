/**
 * Batch 4 application controller for the authenticated LIVE data boundary.
 *
 * This module performs explicit one-shot operations only. Polling, retries,
 * staleness timers, and presentation belong to Batch 5.
 */
import {
  LiveApiError,
  createLiveApiClient,
  type LiveApiClient,
  type LiveApiErrorCode,
} from './live.api';
import type { LiveApiPath, LiveApiResponseMap } from './live.contracts';
import { useLiveStore } from './live.state';

function getErrorCode(error: unknown): LiveApiErrorCode {
  return error instanceof LiveApiError ? error.code : 'UNEXPECTED_RESPONSE';
}

function applySessionRequired(): void {
  useLiveStore.getState().clearPrivateLiveData();
}

export interface LiveController {
  bootstrapSession(): Promise<boolean>;
  login(password: string): Promise<void>;
  logout(): Promise<void>;
  loadResource<K extends LiveApiPath>(path: K): Promise<LiveApiResponseMap[K]>;
}

export function createLiveController(
  api: LiveApiClient = createLiveApiClient(),
): LiveController {
  return {
    async bootstrapSession(): Promise<boolean> {
      useLiveStore.getState().setConnection('CONNECTING');
      useLiveStore.getState().setSession('UNKNOWN');
      try {
        await api.getSession();
        useLiveStore.getState().setSession('AUTHENTICATED');
        // A valid BFF session does not prove that the Python API is reachable.
        useLiveStore.getState().setConnection('CONNECTING');
        return true;
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'SESSION_REQUIRED') {
          applySessionRequired();
          return false;
        }
        useLiveStore.getState().setSession('UNKNOWN');
        useLiveStore.getState().setConnection(code === 'OFFLINE' ? 'OFFLINE' : 'ERROR');
        throw error;
      }
    },

    async login(password: string): Promise<void> {
      useLiveStore.getState().clearPrivateLiveData();
      useLiveStore.getState().setSession('UNKNOWN');
      useLiveStore.getState().setConnection('CONNECTING');
      try {
        await api.login(password);
        useLiveStore.getState().setSession('AUTHENTICATED');
        useLiveStore.getState().setConnection('CONNECTING');
      } catch (error) {
        useLiveStore.getState().clearPrivateLiveData();
        useLiveStore.getState().setConnection('ERROR');
        throw error;
      }
    },

    async logout(): Promise<void> {
      // Remove private LIVE data before waiting for the network response.
      useLiveStore.getState().clearPrivateLiveData();
      useLiveStore.getState().setSession('UNKNOWN');
      useLiveStore.getState().setConnection('CONNECTING');
      try {
        await api.logout();
        api.clearCsrfToken();
        applySessionRequired();
      } catch (error) {
        api.clearCsrfToken();
        useLiveStore.getState().clearPrivateLiveData();
        useLiveStore.getState().setConnection('ERROR');
        throw error;
      }
    },

    async loadResource<K extends LiveApiPath>(path: K): Promise<LiveApiResponseMap[K]> {
      useLiveStore.getState().setResourceLoading(path);
      try {
        const data = await api.get(path);
        useLiveStore.getState().setResourceSuccess(path, data);
        useLiveStore.getState().setSession('AUTHENTICATED');
        return data;
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'SESSION_REQUIRED') {
          api.clearCsrfToken();
          applySessionRequired();
        } else {
          useLiveStore.getState().setResourceError(path, code);
          useLiveStore.getState().setConnection(code === 'OFFLINE' ? 'OFFLINE' : 'ERROR');
        }
        throw error;
      }
    },
  };
}

export const liveController = createLiveController();
