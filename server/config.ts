/**
 * SIREADER Phase 3.2 BFF - Configuration Module
 *
 * Enforces strict security baseline:
 * - Literal loopback binding only: exactly 127.0.0.1 (all other addresses rejected).
 * - Fixed browser Host: 127.0.0.1:3000 (cannot be overridden).
 * - Fixed browser Origin: http://127.0.0.1:3000 (cannot be overridden).
 * - Approved topology ports: 3001 in development, 3000 in production.
 * - Maximum request body size: 1024 bytes (1 KiB).
 */

export const FIXED_RUNTIME_HOST = '127.0.0.1' as const;
export const FIXED_BROWSER_HOST = '127.0.0.1:3000' as const;
export const FIXED_BROWSER_ORIGIN = 'http://127.0.0.1:3000' as const;
export const APPROVED_TOPOLOGY_PORTS = Object.freeze([3000, 3001] as const);

export interface BffConfig {
  readonly host: typeof FIXED_RUNTIME_HOST;
  readonly port: 3000 | 3001;
  readonly allowedHost: typeof FIXED_BROWSER_HOST;
  readonly allowedOrigin: typeof FIXED_BROWSER_ORIGIN;
  readonly maxJsonBodyBytes: number;
}

export function loadBffConfig(overrides?: Partial<BffConfig>): BffConfig {
  // 1. Strict Host enforcement: runtime host MUST be literally '127.0.0.1'
  if (process.env.BFF_HOST !== undefined && process.env.BFF_HOST !== FIXED_RUNTIME_HOST) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: BFF_HOST cannot be set to "${process.env.BFF_HOST}". Runtime host must be literally ${FIXED_RUNTIME_HOST}.`,
    );
  }

  if (overrides?.host !== undefined && overrides.host !== FIXED_RUNTIME_HOST) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Host override "${String(overrides.host)}" rejected. Runtime host must be literally ${FIXED_RUNTIME_HOST}.`,
    );
  }

  // 2. Fixed Browser Host enforcement: cannot be overridden
  if (
    process.env.BFF_ALLOWED_HOST !== undefined &&
    process.env.BFF_ALLOWED_HOST !== FIXED_BROWSER_HOST
  ) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: BFF_ALLOWED_HOST cannot override fixed browser host "${FIXED_BROWSER_HOST}".`,
    );
  }

  if (
    overrides?.allowedHost !== undefined &&
    overrides.allowedHost !== FIXED_BROWSER_HOST
  ) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: allowedHost override cannot alter fixed browser host "${FIXED_BROWSER_HOST}".`,
    );
  }

  // 3. Fixed Browser Origin enforcement: cannot be overridden
  if (
    process.env.BFF_ALLOWED_ORIGIN !== undefined &&
    process.env.BFF_ALLOWED_ORIGIN !== FIXED_BROWSER_ORIGIN
  ) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: BFF_ALLOWED_ORIGIN cannot override fixed browser origin "${FIXED_BROWSER_ORIGIN}".`,
    );
  }

  if (
    overrides?.allowedOrigin !== undefined &&
    overrides.allowedOrigin !== FIXED_BROWSER_ORIGIN
  ) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: allowedOrigin override cannot alter fixed browser origin "${FIXED_BROWSER_ORIGIN}".`,
    );
  }

  // 4. Approved Port topology enforcement: 3001 (dev) or 3000 (prod)
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultPort: 3000 | 3001 = isProduction ? 3000 : 3001;

  let rawPort: unknown = overrides?.port;
  if (rawPort === undefined && process.env.BFF_PORT !== undefined) {
    rawPort = Number(process.env.BFF_PORT);
  }
  if (rawPort === undefined) {
    rawPort = defaultPort;
  }

  if (typeof rawPort !== 'number' || !Number.isInteger(rawPort)) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Invalid port "${String(rawPort)}". Port must be an integer.`,
    );
  }

  if (rawPort !== 3000 && rawPort !== 3001) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: Port ${rawPort} rejected. Must be an approved topology port: 3001 (development) or 3000 (production).`,
    );
  }

  const port = rawPort as 3000 | 3001;

  // 5. Max JSON body size limit
  const maxJsonBodyBytes = overrides?.maxJsonBodyBytes ?? 1024;
  if (
    typeof maxJsonBodyBytes !== 'number' ||
    !Number.isInteger(maxJsonBodyBytes) ||
    maxJsonBodyBytes <= 0 ||
    maxJsonBodyBytes > 1024
  ) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: maxJsonBodyBytes must be an integer between 1 and 1024. Received: ${maxJsonBodyBytes}.`,
    );
  }

  return Object.freeze({
    host: FIXED_RUNTIME_HOST,
    port,
    allowedHost: FIXED_BROWSER_HOST,
    allowedOrigin: FIXED_BROWSER_ORIGIN,
    maxJsonBodyBytes,
  });
}

export const defaultBffConfig: BffConfig = loadBffConfig();
