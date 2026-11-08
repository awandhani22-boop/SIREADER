/**
 * SIREADER Phase 3.2 BFF - Sanitized Safe Logger
 *
 * Strict Security Boundary:
 * - NEVER log request headers (especially Cookie, Authorization, X-CSRF-Token, Host).
 * - NEVER log request or response body contents.
 * - NEVER log secrets, tokens, credentials, or internal stack traces.
 * - Records only sanitized operational metadata: method, path (query stripped), status, code, duration.
 */

export interface SafeLogEntry {
  readonly level: 'INFO' | 'WARN' | 'ERROR';
  readonly method?: string;
  readonly path?: string;
  readonly statusCode?: number;
  readonly errorCode?: string;
  readonly message: string;
  readonly durationMs?: number;
}

export class SafeLogger {
  private static sanitizePath(rawPath?: string): string | undefined {
    if (!rawPath) return undefined;
    // Strip query strings and fragment
    const clean = rawPath.split(/[?#]/)[0] || '';
    // Bounded length and strip non-printable characters
    return clean.replace(/[^\x20-\x7E]/g, '').slice(0, 100);
  }

  static formatEntry(entry: SafeLogEntry): string {
    const parts: string[] = [
      `[${entry.level}]`,
      entry.method ? `${entry.method}` : '',
      entry.path ? `${this.sanitizePath(entry.path)}` : '',
      entry.statusCode ? `${entry.statusCode}` : '',
      entry.errorCode ? `(${entry.errorCode})` : '',
      entry.message,
      entry.durationMs !== undefined ? `${entry.durationMs.toFixed(2)}ms` : '',
    ].filter(Boolean);

    return parts.join(' ');
  }

  static info(
    message: string,
    meta?: Omit<SafeLogEntry, 'level' | 'message'>,
  ): void {
    const entry: SafeLogEntry = { level: 'INFO', message, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.log(this.formatEntry(entry));
    }
  }

  static warn(
    message: string,
    meta?: Omit<SafeLogEntry, 'level' | 'message'>,
  ): void {
    const entry: SafeLogEntry = { level: 'WARN', message, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.warn(this.formatEntry(entry));
    }
  }

  static error(
    message: string,
    meta?: Omit<SafeLogEntry, 'level' | 'message'>,
  ): void {
    const entry: SafeLogEntry = { level: 'ERROR', message, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.error(this.formatEntry(entry));
    }
  }
}
