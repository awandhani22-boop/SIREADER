import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { SafeLogger } from './log.ts';
import { sendBffError } from './errors.ts';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const OPERATOR_SESSION_COOKIE = '__Host-sireader_sid' as const;
export const OPERATOR_SESSION_IDLE_MS = 60 * 60 * 1000;
export const OPERATOR_SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const OPERATOR_SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
export const OPERATOR_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const OPERATOR_LOGIN_MAX_FAILURES = 5;

interface ParsedPasswordHash { readonly salt: Buffer; readonly derivedKey: Buffer; }
interface OperatorSession { readonly csrfToken: string; readonly createdAt: number; lastActivityAt: number; }
interface LoginFailureWindow { readonly startedAt: number; failures: number; }

export interface OperatorAuthOptions {
  /** Test/configuration seam. Production defaults to process.env.OPERATOR_PASSWORD_HASH. */
  readonly passwordHash?: string;
  readonly now?: () => number;
  readonly randomBytes?: (size: number) => Buffer;
}
export type OperatorLoginResult =
  | { readonly kind: 'authenticated'; readonly sessionId: string; readonly csrfToken: string }
  | { readonly kind: 'invalid_credentials' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'not_configured' };

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_BYTES, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}
function decodeCanonicalBase64Url(value: string, expectedBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === expectedBytes && decoded.toString('base64url') === value
      ? decoded
      : null;
  } catch { return null; }
}
function parsePasswordHash(value: string | undefined): ParsedPasswordHash | null {
  if (!value || value.length > 256) return null;
  const parts = value.split('$');
  if (
    parts.length !== 6 || parts[0] !== 'scrypt' ||
    parts[1] !== String(SCRYPT_N) || parts[2] !== String(SCRYPT_R) ||
    parts[3] !== String(SCRYPT_P)
  ) return null;
  const salt = decodeCanonicalBase64Url(parts[4], SCRYPT_SALT_BYTES);
  const derivedKey = decodeCanonicalBase64Url(parts[5], SCRYPT_KEY_BYTES);
  return salt && derivedKey ? { salt, derivedKey } : null;
}
export async function hashOperatorPassword(
  password: string,
  salt: Buffer = randomBytes(SCRYPT_SALT_BYTES),
): Promise<string> {
  if (typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password, 'utf8') > 256) {
    throw new Error('Operator password must contain 1–256 UTF-8 bytes.');
  }
  if (salt.length !== SCRYPT_SALT_BYTES) throw new Error('Operator password salt must be exactly 16 bytes.');
  const derivedKey = await deriveKey(password, salt);
  return ['scrypt', String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P),
    salt.toString('base64url'), derivedKey.toString('base64url')].join('$');
}
function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}
function findSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const prefix = OPERATOR_SESSION_COOKIE + '=';
  const matches = cookieHeader.split(';').map((part) => part.trim()).filter((part) => part.startsWith(prefix));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(prefix.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function appendSetCookie(res: Response, cookieValue: string, maxAgeSeconds: number): void {
  res.append('Set-Cookie',
    OPERATOR_SESSION_COOKIE + '=' + cookieValue +
    '; Max-Age=' + String(maxAgeSeconds) +
    '; Path=/; HttpOnly; Secure; SameSite=Strict');
}
function clearSessionCookie(res: Response): void {
  res.append('Set-Cookie',
    OPERATOR_SESSION_COOKIE + '=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict');
}
export function disableAuthCaching(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

export class OperatorAuthService {
  private readonly passwordHash: ParsedPasswordHash | null;
  private readonly now: () => number;
  private readonly random: (size: number) => Buffer;
  private readonly sessions = new Map<string, OperatorSession>();
  private readonly failedLogins = new Map<string, LoginFailureWindow>();

  constructor(options: OperatorAuthOptions = {}) {
    this.passwordHash = parsePasswordHash(options.passwordHash ?? process.env.OPERATOR_PASSWORD_HASH);
    this.now = options.now ?? Date.now;
    this.random = options.randomBytes ?? randomBytes;
  }
  get isConfigured(): boolean { return this.passwordHash !== null; }

  private removeExpired(now: number): void {
    for (const [key, session] of this.sessions) {
      if (now - session.lastActivityAt >= OPERATOR_SESSION_IDLE_MS ||
          now - session.createdAt >= OPERATOR_SESSION_ABSOLUTE_MS) this.sessions.delete(key);
    }
    for (const [ip, window] of this.failedLogins) {
      if (now - window.startedAt >= OPERATOR_LOGIN_WINDOW_MS) this.failedLogins.delete(ip);
    }
  }
  private isRateLimited(ip: string, now: number): boolean {
    const window = this.failedLogins.get(ip);
    if (!window) return false;
    if (now - window.startedAt >= OPERATOR_LOGIN_WINDOW_MS) {
      this.failedLogins.delete(ip);
      return false;
    }
    return window.failures >= OPERATOR_LOGIN_MAX_FAILURES;
  }
  private recordFailedLogin(ip: string, now: number): boolean {
    let window = this.failedLogins.get(ip);
    if (!window || now - window.startedAt >= OPERATOR_LOGIN_WINDOW_MS) {
      window = { startedAt: now, failures: 0 };
      this.failedLogins.set(ip, window);
    }
    window.failures += 1;
    return window.failures >= OPERATOR_LOGIN_MAX_FAILURES;
  }
  private revokeCookie(cookieHeader: string | undefined): void {
    const sessionId = findSessionCookie(cookieHeader);
    if (sessionId) this.sessions.delete(sha256Base64Url(sessionId));
  }
  private createSession(): { sessionId: string; csrfToken: string } {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sessionId = this.random(32).toString('base64url');
      const csrfToken = this.random(32).toString('base64url');
      const key = sha256Base64Url(sessionId);
      if (!this.sessions.has(key)) {
        const now = this.now();
        this.sessions.set(key, { csrfToken, createdAt: now, lastActivityAt: now });
        return { sessionId, csrfToken };
      }
    }
    throw new Error('Unable to allocate a unique operator session identifier.');
  }
  async authenticate(password: string, remoteAddress: string | undefined, currentCookieHeader?: string): Promise<OperatorLoginResult> {
    if (!this.passwordHash) return { kind: 'not_configured' };
    const now = this.now();
    this.removeExpired(now);
    const ip = remoteAddress || 'unknown';
    if (this.isRateLimited(ip, now)) return { kind: 'rate_limited' };
    const candidate = await deriveKey(password, this.passwordHash.salt);
    const valid = timingSafeEqual(candidate, this.passwordHash.derivedKey);
    if (!valid) {
      return this.recordFailedLogin(ip, now)
        ? { kind: 'rate_limited' }
        : { kind: 'invalid_credentials' };
    }
    this.failedLogins.delete(ip);
    this.revokeCookie(currentCookieHeader);
    const session = this.createSession();
    return { kind: 'authenticated', ...session };
  }
  private currentSession(cookieHeader: string | undefined): OperatorSession | null {
    const sessionId = findSessionCookie(cookieHeader);
    if (!sessionId) return null;
    const key = sha256Base64Url(sessionId);
    const session = this.sessions.get(key);
    if (!session) return null;
    const now = this.now();
    if (now - session.lastActivityAt >= OPERATOR_SESSION_IDLE_MS ||
        now - session.createdAt >= OPERATOR_SESSION_ABSOLUTE_MS) {
      this.sessions.delete(key);
      return null;
    }
    session.lastActivityAt = now;
    return session;
  }

  readonly requireSession: RequestHandler = (req, res, next): void => {
    disableAuthCaching(res);
    const session = this.currentSession(req.headers.cookie);
    if (!session) {
      clearSessionCookie(res);
      SafeLogger.warn('SESSION_UNAUTHENTICATED', {
        method: req.method, route: req.path, statusCode: 401, errorCode: 'SESSION_REQUIRED',
      });
      sendBffError(res, 401, 'SESSION_REQUIRED', 'An active operator session is required.');
      return;
    }
    res.locals.operatorCsrfToken = session.csrfToken;
    next();
  };

  readonly requireCsrf: RequestHandler = (req, res, next): void => {
    const expected = res.locals.operatorCsrfToken;
    const supplied = req.headers['x-csrf-token'];
    if (typeof expected !== 'string' || typeof supplied !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(supplied)) {
      SafeLogger.warn('CSRF_REJECTED', {
        method: req.method, route: req.path, statusCode: 403, errorCode: 'CSRF_INVALID',
      });
      sendBffError(res, 403, 'CSRF_INVALID', 'A valid CSRF token is required.');
      return;
    }
    const expectedBytes = Buffer.from(expected, 'base64url');
    const suppliedBytes = Buffer.from(supplied, 'base64url');
    if (expectedBytes.length !== 32 || suppliedBytes.length !== 32 ||
        !timingSafeEqual(expectedBytes, suppliedBytes)) {
      SafeLogger.warn('CSRF_REJECTED', {
        method: req.method, route: req.path, statusCode: 403, errorCode: 'CSRF_INVALID',
      });
      sendBffError(res, 403, 'CSRF_INVALID', 'A valid CSRF token is required.');
      return;
    }
    next();
  };

  revokeRequestSession(req: Request): void { this.revokeCookie(req.headers.cookie); }
  setLoginCookie(res: Response, sessionId: string): void {
    appendSetCookie(res, sessionId, OPERATOR_SESSION_COOKIE_MAX_AGE_SECONDS);
    disableAuthCaching(res);
  }
  clearCookie(res: Response): void {
    clearSessionCookie(res);
    disableAuthCaching(res);
  }
}
