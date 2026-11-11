/**
 * SIREADER Phase 3.2 BFF - Route Allowlist
 *
 * Defines the canonical fixed allowlist of permitted routes:
 * - 3 Authentication & Session lifecycle endpoints
 * - 5 Phase 3 observability snapshots, 5 Phase 4/5.2 workforce read endpoints, and 1 SSE endpoint
 * - 4 Phase 5.1 workforce command endpoints
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
    path: '/api/v1/workforce/tasks/:taskId/timeline',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only lifecycle audit timeline and retry lineage for one task',
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
    path: '/api/v1/workforce/reviews/pending',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only pending workforce output reviews',
  },
  {
    path: '/api/v1/governance/reviews/pending',
    allowedMethods: Object.freeze(['GET']),
    description: 'Read-only pending governance output reviews',
  },
  {
    path: '/api/v1/events/stream',
    allowedMethods: Object.freeze(['GET']),
    description: 'Authenticated SSE resource invalidation stream',
  },
  // Narrow human-supervised workforce command surface (operator session + CSRF).
  {
    path: '/api/v1/commands/reviews/adjudicate',
    allowedMethods: Object.freeze(['POST']),
    description: 'Adjudicate one quarantined workforce output review',
  },
  {
    path: '/api/v1/commands/tasks/enqueue',
    allowedMethods: Object.freeze(['POST']),
    description: 'Enqueue one bounded generic non-trading workforce task',
  },
  {
    path: '/api/v1/commands/tasks/cancel',
    allowedMethods: Object.freeze(['POST']),
    description: 'Request safe cancellation of an eligible non-trading task',
  },
  {
    path: '/api/v1/commands/tasks/retry',
    allowedMethods: Object.freeze(['POST']),
    description: 'Retry one known pre-provider failed non-trading task as a new task',
  },
  {
    path: '/api/v1/commands/workers/scheduling',
    allowedMethods: Object.freeze(['POST']),
    description: 'Pause or resume scheduling for an eligible non-trading worker',
  },
]);

const CANONICAL_ROUTE_MAP = new Map<string, readonly string[]>(
  CANONICAL_ROUTES.map((route) => [route.path, route.allowedMethods]),
);

export const WORKFORCE_TASK_TIMELINE_PATTERN = /^\/api\/v1\/workforce\/tasks\/[^/]+\/timeline$/;
export const REVIEW_DETAIL_ROUTE_PATTERN = /^\/api\/v1\/(?:workforce|governance)\/reviews\/rev_[A-Za-z0-9_-]{8,60}$/;
const GET_ONLY_METHODS = Object.freeze(['GET'] as const);

export function isAllowlistedPath(path: string): boolean {
  return CANONICAL_ROUTE_MAP.has(path) ||
    WORKFORCE_TASK_TIMELINE_PATTERN.test(path) ||
    REVIEW_DETAIL_ROUTE_PATTERN.test(path);
}

export function getAllowedMethods(path: string): readonly string[] | undefined {
  const allowed = CANONICAL_ROUTE_MAP.get(path);
  if (allowed) return allowed;
  if (WORKFORCE_TASK_TIMELINE_PATTERN.test(path) || REVIEW_DETAIL_ROUTE_PATTERN.test(path)) {
    return GET_ONLY_METHODS;
  }
  return undefined;
}

export function isMethodAllowed(path: string, method: string): boolean {
  const allowed = getAllowedMethods(path);
  if (!allowed) return false;
  return allowed.includes(method.toUpperCase());
}
