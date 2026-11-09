/**
 * SIREADER Phase 3.2 BFF - Route Allowlist
 *
 * Defines the canonical fixed allowlist of exactly 13 permitted routes:
 * - 3 Authentication & Session lifecycle endpoints
 * - 5 Phase 3 observability snapshots, 4 Phase 4 workforce read endpoints, and 1 SSE endpoint
 *
 * Strictly prevents arbitrary proxy paths or wildcard forwarding.
 */

export interface CanonicalRouteDefinition {
  readonly path: string;
  readonly allowedMethods: readonly string[];
  readonly description: string;
}

export const CANONICAL_ROUTES: readonly CanonicalRouteDefinition[] = Object.freeze([
  // Authentication & Session lifecycle (Domain 1 - Operator Boundary)
  {
    path: '/api/auth/session',
    allowedMethods: Object.freeze(['GET']),
    description: 'Current operator session validation and status probe',
  },
  {
    path: '/api/auth/login',
    allowedMethods: Object.freeze(['POST']),
    description: 'Operator credentials login and session cookie establishment',
  },
  {
    path: '/api/auth/logout',
    allowedMethods: Object.freeze(['POST']),
    description: 'Operator session revocation and cookie clearing',
  },
  // Read-Only Backend Observability Gateway (Domain 2 - Python Backend Boundary)
  {
    path: '/api/v1/system/status',
    allowedMethods: Object.freeze(['GET']),
    description: 'Core backend engine and service status',
  },
  {
    path: '/api/v1/telemetry/usage',
    allowedMethods: Object.freeze(['GET']),
    description: 'LLM token consumption and estimated cost telemetry',
  },
  {
    path: '/api/v1/pipeline/active',
    allowedMethods: Object.freeze(['GET']),
    description: 'Active in-flight message processing pipeline items',
  },
  {
    path: '/api/v1/market-watches/active',
    allowedMethods: Object.freeze(['GET']),
    description: 'Active symbol/spread decision watches',
  },
  {
    path: '/api/v1/audit/decisions',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only trade and signal approval decision history',
  },
  {
    path: '/api/v1/workforce/runtime',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only persistent worker registry and runtime health',
  },
  {
    path: '/api/v1/workforce/tasks',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only persistent workforce task queue and lifecycle',
  },
  {
    path: '/api/v1/workforce/attempts',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only attempt history for one validated task ID',
  },
  {
    path: '/api/v1/workforce/activity',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only workforce activity event history',
  },
  {
    path: '/api/v1/events/stream',
    allowedMethods: Object.freeze(['GET']),
    description: 'Authenticated SSE resource invalidation stream',
  },
]);

const CANONICAL_ROUTE_MAP = new Map<string, readonly string[]>(
  CANONICAL_ROUTES.map((route) => [route.path, route.allowedMethods]),
);

export function isAllowlistedPath(path: string): boolean {
  return CANONICAL_ROUTE_MAP.has(path);
}

export function getAllowedMethods(path: string): readonly string[] | undefined {
  return CANONICAL_ROUTE_MAP.get(path);
}

export function isMethodAllowed(path: string, method: string): boolean {
  const allowed = CANONICAL_ROUTE_MAP.get(path);
  if (!allowed) return false;
  return allowed.includes(method.toUpperCase());
}
