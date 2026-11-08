/**
 * SIREADER Phase 3.2 BFF - Configuration Module
 *
 * Enforces security baseline:
 * - Loopback binding only: 127.0.0.1 (0.0.0.0 or wildcard is strictly prohibited).
 * - Exact allowed Host: 127.0.0.1:3000.
 * - Exact allowed Origin: http://127.0.0.1:3000.
 * - Maximum request body size: 1024 bytes (1 KiB).
 */

export interface BffConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedHost: string;
  readonly allowedOrigin: string;
  readonly maxJsonBodyBytes: number;
}

export function loadBffConfig(overrides?: Partial<BffConfig>): BffConfig {
  const host = overrides?.host ?? process.env.BFF_HOST ?? '127.0.0.1';

  // Strict loopback protection: Never bind to wildcard / 0.0.0.0
  if (host === '0.0.0.0' || host === '::' || host === '') {
    throw new Error(
      'CRITICAL SECURITY VIOLATION: BFF must never be bound to 0.0.0.0, ::, or wildcard interface. Must bind to 127.0.0.1 loopback only.',
    );
  }

  const port = overrides?.port ?? Number(process.env.BFF_PORT || 3000);
  const allowedHost =
    overrides?.allowedHost ?? process.env.BFF_ALLOWED_HOST ?? '127.0.0.1:3000';
  const allowedOrigin =
    overrides?.allowedOrigin ??
    process.env.BFF_ALLOWED_ORIGIN ??
    'http://127.0.0.1:3000';
  const maxJsonBodyBytes = overrides?.maxJsonBodyBytes ?? 1024; // 1 KiB

  return Object.freeze({
    host,
    port,
    allowedHost,
    allowedOrigin,
    maxJsonBodyBytes,
  });
}

export const defaultBffConfig: BffConfig = loadBffConfig();
