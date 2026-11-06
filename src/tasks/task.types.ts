/**
 * SIREADER Virtual Office — Phase 2.1 Task & Capability Domain Types
 * Strictly frontend-only local simulation types.
 * Zero `any` usage; full backward compatibility with Phase 1.1.
 */

export const PERMANENT_WORKER_IDS = [
  'supervisor',
  'haiku',
  'sonnet',
  'opus',
  'decision_engineer',
  'market_monitor',
  'data_archivist',
] as const;

export type PermanentWorkerId = (typeof PERMANENT_WORKER_IDS)[number];

export type WorkerId = PermanentWorkerId | (string & {});

/**
 * Official 28 unique capability IDs across the 7 permanent workers in SIREADER.
 */
export const WORKER_CAPABILITY_IDS = [
  // 1. Supervisor
  'instruction_intake',
  'task_decomposition',
  'workflow_supervision',
  'task_assignment_oversight',
  'result_review',
  // 2. Haiku
  'quick_research',
  'information_extraction',
  'summarization',
  'lightweight_classification',
  // 3. Sonnet
  'data_analysis',
  'comparison',
  'evaluation',
  'structured_reasoning',
  // 4. Opus
  'complex_reasoning',
  'strategic_analysis',
  'deep_review',
  'decision_evaluation',
  // 5. Decision Engineer (also shares decision_evaluation)
  'rule_validation',
  'risk_assessment_simulation',
  'decision_consistency_checks',
  // 6. Market Monitor
  'market_monitoring_simulation',
  'market_condition_detection',
  'anomaly_detection_simulation',
  'market_event_reporting',
  // 7. Data Archivist
  'data_archiving',
  'artifact_indexing',
  'historical_retrieval_simulation',
  'data_organization',
] as const;

export type WorkerCapabilityId = (typeof WORKER_CAPABILITY_IDS)[number];

/**
 * Phase 1.1 legacy TaskCategory values preserved for backward compatibility.
 */
export const TASK_CATEGORIES = [
  'ROUTING',
  'CLASSIFICATION',
  'REASONING',
  'ESCALATION',
  'DECISION_CHECK',
  'MARKET_WATCH',
  'ARCHIVAL',
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/**
 * Canonical Phase 2.1 TaskType union:
 * Combines granular capability-aligned task types with Phase 1.1 TaskCategory values
 * for seamless backward compatibility.
 */
export const TASK_TYPES = [
  // Phase 1.1 category-level task types
  'ROUTING',
  'CLASSIFICATION',
  'REASONING',
  'ESCALATION',
  'DECISION_CHECK',
  'MARKET_WATCH',
  'ARCHIVAL',
  // Supervisor task types
  'INSTRUCTION_INTAKE',
  'TASK_DECOMPOSITION',
  'WORKFLOW_SUPERVISION',
  'TASK_ASSIGNMENT_OVERSIGHT',
  'RESULT_REVIEW',
  // Haiku task types
  'QUICK_RESEARCH',
  'INFORMATION_EXTRACTION',
  'SUMMARIZATION',
  'LIGHTWEIGHT_CLASSIFICATION',
  // Sonnet task types
  'DATA_ANALYSIS',
  'COMPARISON',
  'EVALUATION',
  'STRUCTURED_REASONING',
  // Opus task types
  'COMPLEX_REASONING',
  'STRATEGIC_ANALYSIS',
  'DEEP_REVIEW',
  'DECISION_EVALUATION',
  // Decision Engineer task types
  'RULE_VALIDATION',
  'RISK_ASSESSMENT_SIMULATION',
  'DECISION_CONSISTENCY_CHECKS',
  // Market Monitor task types
  'MARKET_MONITORING_SIMULATION',
  'MARKET_CONDITION_DETECTION',
  'ANOMALY_DETECTION_SIMULATION',
  'MARKET_EVENT_REPORTING',
  // Data Archivist task types
  'DATA_ARCHIVING',
  'ARTIFACT_INDEXING',
  'HISTORICAL_RETRIEVAL_SIMULATION',
  'DATA_ORGANIZATION',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

/**
 * TaskPriority levels ordered from highest to lowest urgency.
 */
export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Phase 2.1 canonical lifecycle statuses for the Task State Machine.
 */
export const TASK_LIFECYCLE_STATUSES = [
  'PENDING',
  'QUEUED',
  'ASSIGNED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'RETRY_WAIT',
  'BLOCKED',
  'CANCELLED',
] as const;

export type TaskLifecycleStatus = (typeof TASK_LIFECYCLE_STATUSES)[number];

/**
 * Phase 1.1 execution sub-stage statuses that map to `RUNNING` in Phase 2.1 lifecycle.
 */
export const TASK_EXECUTION_STAGE_STATUSES = [
  'ROUTING',
  'EXTRACTING',
  'ANALYZING',
  'VALIDATING',
  'ARCHIVING',
] as const;

export type TaskExecutionStageStatus = (typeof TASK_EXECUTION_STAGE_STATUSES)[number];

/**
 * Unified TaskStatus supporting both Phase 2.1 lifecycle states and Phase 1.1 stage statuses.
 */
export type TaskStatus = TaskLifecycleStatus | TaskExecutionStageStatus;

export type CapabilityComplexityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CapabilitySchemaDescriptor {
  readonly schemaId: string;
  readonly requiredFields: readonly string[];
  readonly optionalFields: readonly string[];
  readonly outputFormat: 'structured_json' | 'summary_report' | 'validation_verdict' | 'archive_record';
}

export interface CapabilityDefinition {
  readonly capabilityId: WorkerCapabilityId;
  readonly description: string;
  readonly supportedTaskTypes: readonly TaskType[];
  readonly inputSchema: CapabilitySchemaDescriptor;
  readonly outputSchema: CapabilitySchemaDescriptor;
  readonly estimatedDurationMs: number;
  readonly complexityLevel: CapabilityComplexityLevel;
  readonly enabled: boolean;
}

export interface WorkerCapabilityProfile {
  readonly workerId: PermanentWorkerId;
  readonly role: string;
  readonly capabilities: readonly CapabilityDefinition[];
  readonly maxConcurrency: number;
  readonly supportedTaskTypes: readonly TaskType[];
  readonly enabled: boolean;
}

/**
 * Structured, type-safe Task Input payload (never `any`).
 */
export type TaskParameterPrimitive = string | number | boolean | null;

export interface TaskInputPayload {
  readonly instruction: string;
  readonly parameters: Readonly<Record<string, TaskParameterPrimitive | readonly TaskParameterPrimitive[]>>;
  readonly sourceChannel: 'manual_ui' | 'simulation_baseline' | 'supervisor_decomposition' | 'system_test';
  readonly contextTags: readonly string[];
}

/**
 * Structured, type-safe Task Result payload (never `any`).
 */
export interface TaskResultPayload {
  readonly summary: string;
  readonly outputData: Readonly<Record<string, TaskParameterPrimitive | readonly TaskParameterPrimitive[]>>;
  readonly artifacts: readonly string[];
  readonly confidenceScore: number;
  readonly isSimulated: true;
}

/**
 * Structured, type-safe Task Error representation.
 */
export interface TaskErrorDetail {
  readonly code:
    | 'VALIDATION_ERROR'
    | 'INVALID_TRANSITION'
    | 'UNSUPPORTED_CAPABILITY'
    | 'EXECUTION_TIMEOUT_SIMULATED'
    | 'EXECUTION_FAILURE_SIMULATED'
    | 'DEPENDENCY_BLOCKED'
    | 'CANCELLED_BY_USER';
  readonly message: string;
  readonly occurredAtSimMs: number;
  readonly attemptNumber: number;
  readonly recoverable: boolean;
}

export type TaskValidationRuleCode =
  | 'INVALID_TASK_ID'
  | 'DUPLICATE_TASK_ID'
  | 'UNKNOWN_TASK_TYPE'
  | 'INVALID_PRIORITY'
  | 'INVALID_STATUS'
  | 'INVALID_MAX_ATTEMPTS'
  | 'NEGATIVE_ATTEMPT_COUNT'
  | 'ATTEMPT_COUNT_EXCEEDS_MAX'
  | 'DUPLICATE_DEPENDENCY_IDS'
  | 'SELF_DEPENDENCY_DETECTED'
  | 'INVALID_ASSIGNED_WORKER_ID'
  | 'INVALID_INPUT_STRUCTURE'
  | 'INVALID_RESULT_STRUCTURE'
  | 'MISSING_COMPLETED_AT_TIMESTAMP'
  | 'MISSING_STARTED_AT_TIMESTAMP'
  | 'PENDING_TASK_HAS_QUEUED_AT'
  | 'INVALID_TIMESTAMP_ORDER_COMPLETED_BEFORE_STARTED'
  | 'INVALID_TIMESTAMP_ORDER_UPDATED_BEFORE_CREATED'
  | 'NEGATIVE_SIMULATION_TIMESTAMP';

export interface TaskValidationIssue {
  readonly code: TaskValidationRuleCode;
  readonly field: string;
  readonly message: string;
}

export interface TaskValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TaskValidationIssue[];
}

export interface TaskTransitionError {
  readonly code: 'INVALID_STATUS_TRANSITION' | 'TERMINAL_STATUS_IMMUTABLE' | 'UNKNOWN_TASK_STATUS';
  readonly taskId: string | null;
  readonly fromStatus: TaskStatus;
  readonly fromLifecycleStatus: TaskLifecycleStatus;
  readonly toStatus: TaskStatus;
  readonly toLifecycleStatus: TaskLifecycleStatus;
  readonly allowedTargets: readonly TaskLifecycleStatus[];
  readonly message: string;
}
