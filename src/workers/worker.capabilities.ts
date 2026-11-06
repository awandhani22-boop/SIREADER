import {
  CapabilityDefinition,
  PERMANENT_WORKER_IDS,
  PermanentWorkerId,
  TaskCategory,
  TaskType,
  WORKER_CAPABILITY_IDS,
  WorkerCapabilityId,
  WorkerCapabilityProfile,
  WorkerId,
} from '../tasks/task.types';

/**
 * Centralized Worker Capability Registry (Phase 2.1)
 * Single source of truth for static capability metadata across the 7 permanent workers.
 * Strictly separated from runtime worker status (`IDLE`, `BUSY`, `PAUSED`).
 * All exported structures and query results are deeply frozen and defensive-cloned
 * so external callers cannot mutate internal registry state.
 */

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const prop = (value as Record<string, unknown>)[key];
      if (prop && typeof prop === 'object' && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    }
  }
  return value;
}

function cloneCapabilityDefinition(def: CapabilityDefinition): CapabilityDefinition {
  return deepFreeze({
    capabilityId: def.capabilityId,
    description: def.description,
    supportedTaskTypes: [...def.supportedTaskTypes],
    inputSchema: {
      schemaId: def.inputSchema.schemaId,
      requiredFields: [...def.inputSchema.requiredFields],
      optionalFields: [...def.inputSchema.optionalFields],
      outputFormat: def.inputSchema.outputFormat,
    },
    outputSchema: {
      schemaId: def.outputSchema.schemaId,
      requiredFields: [...def.outputSchema.requiredFields],
      optionalFields: [...def.outputSchema.optionalFields],
      outputFormat: def.outputSchema.outputFormat,
    },
    estimatedDurationMs: def.estimatedDurationMs,
    complexityLevel: def.complexityLevel,
    enabled: def.enabled,
  });
}

function cloneWorkerCapabilityProfile(
  profile: WorkerCapabilityProfile,
): WorkerCapabilityProfile {
  return deepFreeze({
    workerId: profile.workerId,
    role: profile.role,
    capabilities: profile.capabilities.map(cloneCapabilityDefinition),
    maxConcurrency: profile.maxConcurrency,
    supportedTaskTypes: [...profile.supportedTaskTypes],
    enabled: profile.enabled,
  });
}

/**
 * Canonical catalog of all 28 unique capability definitions.
 */
const CANONICAL_CAPABILITY_CATALOG: Readonly<
  Record<WorkerCapabilityId, CapabilityDefinition>
> = deepFreeze({
  // 1. Supervisor capabilities
  instruction_intake: {
    capabilityId: 'instruction_intake',
    description: 'Receives raw operator instructions and normalizes task objectives.',
    supportedTaskTypes: ['INSTRUCTION_INTAKE', 'ROUTING'],
    inputSchema: {
      schemaId: 'schema.supervisor.instruction_intake.in',
      requiredFields: ['instruction'],
      optionalFields: ['priorityHint', 'targetDepartment'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.supervisor.instruction_intake.out',
      requiredFields: ['normalizedObjective', 'routingCategory'],
      optionalFields: ['notes'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 4500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  task_decomposition: {
    capabilityId: 'task_decomposition',
    description: 'Breaks complex directives into discrete, dependency-ordered subtasks.',
    supportedTaskTypes: ['TASK_DECOMPOSITION', 'ROUTING'],
    inputSchema: {
      schemaId: 'schema.supervisor.task_decomposition.in',
      requiredFields: ['instruction'],
      optionalFields: ['maxSubtasks'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.supervisor.task_decomposition.out',
      requiredFields: ['subtaskPlan', 'dependencyOrder'],
      optionalFields: ['estimatedTotalSimMs'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 6500,
    complexityLevel: 'HIGH',
    enabled: true,
  },
  workflow_supervision: {
    capabilityId: 'workflow_supervision',
    description: 'Monitors multi-stage execution pipelines across specialist rooms.',
    supportedTaskTypes: ['WORKFLOW_SUPERVISION', 'ROUTING'],
    inputSchema: {
      schemaId: 'schema.supervisor.workflow_supervision.in',
      requiredFields: ['instruction'],
      optionalFields: ['activeWorkflowId'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.supervisor.workflow_supervision.out',
      requiredFields: ['workflowHealth', 'stageCheckpoint'],
      optionalFields: ['escalationFlags'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 6000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  task_assignment_oversight: {
    capabilityId: 'task_assignment_oversight',
    description: 'Audits worker capability matching and queue allocation fairness.',
    supportedTaskTypes: ['TASK_ASSIGNMENT_OVERSIGHT', 'ROUTING'],
    inputSchema: {
      schemaId: 'schema.supervisor.task_assignment_oversight.in',
      requiredFields: ['instruction'],
      optionalFields: ['candidateWorkerIds'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.supervisor.task_assignment_oversight.out',
      requiredFields: ['selectedWorkerId', 'rationale'],
      optionalFields: ['fallbackWorkerId'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 5000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  result_review: {
    capabilityId: 'result_review',
    description: 'Reviews completed specialist outputs for completeness before delivery.',
    supportedTaskTypes: ['RESULT_REVIEW', 'ROUTING'],
    inputSchema: {
      schemaId: 'schema.supervisor.result_review.in',
      requiredFields: ['instruction'],
      optionalFields: ['upstreamTaskId'],
      outputFormat: 'summary_report',
    },
    outputSchema: {
      schemaId: 'schema.supervisor.result_review.out',
      requiredFields: ['approved', 'reviewSummary'],
      optionalFields: ['revisionNotes'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 5500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },

  // 2. Haiku capabilities
  quick_research: {
    capabilityId: 'quick_research',
    description: 'Executes rapid low-latency headline and signal triage lookups.',
    supportedTaskTypes: ['QUICK_RESEARCH', 'CLASSIFICATION'],
    inputSchema: {
      schemaId: 'schema.haiku.quick_research.in',
      requiredFields: ['instruction'],
      optionalFields: ['queryKeywords'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.haiku.quick_research.out',
      requiredFields: ['findings', 'relevanceScore'],
      optionalFields: ['tags'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 4000,
    complexityLevel: 'LOW',
    enabled: true,
  },
  information_extraction: {
    capabilityId: 'information_extraction',
    description: 'Extracts structured entities, tickers, and timestamps from raw text.',
    supportedTaskTypes: ['INFORMATION_EXTRACTION', 'CLASSIFICATION'],
    inputSchema: {
      schemaId: 'schema.haiku.information_extraction.in',
      requiredFields: ['instruction'],
      optionalFields: ['entityTypes'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.haiku.information_extraction.out',
      requiredFields: ['entities', 'tokenCount'],
      optionalFields: ['confidence'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 4500,
    complexityLevel: 'LOW',
    enabled: true,
  },
  summarization: {
    capabilityId: 'summarization',
    description: 'Condenses verbose telemetry logs and reports into concise briefs.',
    supportedTaskTypes: ['SUMMARIZATION', 'CLASSIFICATION'],
    inputSchema: {
      schemaId: 'schema.haiku.summarization.in',
      requiredFields: ['instruction'],
      optionalFields: ['maxBulletPoints'],
      outputFormat: 'summary_report',
    },
    outputSchema: {
      schemaId: 'schema.haiku.summarization.out',
      requiredFields: ['summaryBullets', 'compressionRatio'],
      optionalFields: ['keyHighlights'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 4200,
    complexityLevel: 'LOW',
    enabled: true,
  },
  lightweight_classification: {
    capabilityId: 'lightweight_classification',
    description: 'Tags incoming events by sentiment, urgency, and asset category.',
    supportedTaskTypes: ['LIGHTWEIGHT_CLASSIFICATION', 'CLASSIFICATION'],
    inputSchema: {
      schemaId: 'schema.haiku.lightweight_classification.in',
      requiredFields: ['instruction'],
      optionalFields: ['taxonomyVersion'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.haiku.lightweight_classification.out',
      requiredFields: ['label', 'sentimentBucket'],
      optionalFields: ['probability'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 3800,
    complexityLevel: 'LOW',
    enabled: true,
  },

  // 3. Sonnet capabilities
  data_analysis: {
    capabilityId: 'data_analysis',
    description: 'Performs multi-factor regime analysis and correlation scoring.',
    supportedTaskTypes: ['DATA_ANALYSIS', 'REASONING'],
    inputSchema: {
      schemaId: 'schema.sonnet.data_analysis.in',
      requiredFields: ['instruction'],
      optionalFields: ['timeframe', 'factors'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.sonnet.data_analysis.out',
      requiredFields: ['regimeScore', 'factorWeights'],
      optionalFields: ['diagnostics'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 9000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  comparison: {
    capabilityId: 'comparison',
    description: 'Compares competing analytical hypotheses and historical baselines.',
    supportedTaskTypes: ['COMPARISON', 'REASONING'],
    inputSchema: {
      schemaId: 'schema.sonnet.comparison.in',
      requiredFields: ['instruction'],
      optionalFields: ['baselineScenario', 'candidateScenario'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.sonnet.comparison.out',
      requiredFields: ['deltaMatrix', 'preferredScenario'],
      optionalFields: ['tradeoffs'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 8500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  evaluation: {
    capabilityId: 'evaluation',
    description: 'Evaluates analytical signal quality against historical precision bands.',
    supportedTaskTypes: ['EVALUATION', 'REASONING'],
    inputSchema: {
      schemaId: 'schema.sonnet.evaluation.in',
      requiredFields: ['instruction'],
      optionalFields: ['confidenceThreshold'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.sonnet.evaluation.out',
      requiredFields: ['qualityScore', 'evaluationVerdict'],
      optionalFields: ['caveats'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 9500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  structured_reasoning: {
    capabilityId: 'structured_reasoning',
    description: 'Synthesizes step-by-step causal chains from extracted evidence.',
    supportedTaskTypes: ['STRUCTURED_REASONING', 'REASONING'],
    inputSchema: {
      schemaId: 'schema.sonnet.structured_reasoning.in',
      requiredFields: ['instruction'],
      optionalFields: ['premises'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.sonnet.structured_reasoning.out',
      requiredFields: ['reasoningSteps', 'conclusion'],
      optionalFields: ['assumptions'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 10000,
    complexityLevel: 'HIGH',
    enabled: true,
  },

  // 4. Opus capabilities (decision_evaluation is shared with Decision Engineer)
  complex_reasoning: {
    capabilityId: 'complex_reasoning',
    description: 'Resolves high-ambiguity multi-domain conflicts and tail-risk scenarios.',
    supportedTaskTypes: ['COMPLEX_REASONING', 'ESCALATION'],
    inputSchema: {
      schemaId: 'schema.opus.complex_reasoning.in',
      requiredFields: ['instruction'],
      optionalFields: ['conflictingInputs'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.opus.complex_reasoning.out',
      requiredFields: ['resolutionThesis', 'confidenceInterval'],
      optionalFields: ['counterfactuals'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 13000,
    complexityLevel: 'CRITICAL',
    enabled: true,
  },
  strategic_analysis: {
    capabilityId: 'strategic_analysis',
    description: 'Formulates long-horizon strategic posture and macro stress tests.',
    supportedTaskTypes: ['STRATEGIC_ANALYSIS', 'ESCALATION'],
    inputSchema: {
      schemaId: 'schema.opus.strategic_analysis.in',
      requiredFields: ['instruction'],
      optionalFields: ['horizonDays'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.opus.strategic_analysis.out',
      requiredFields: ['strategicPosture', 'stressScenarios'],
      optionalFields: ['hedgingNotes'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 12000,
    complexityLevel: 'HIGH',
    enabled: true,
  },
  deep_review: {
    capabilityId: 'deep_review',
    description: 'Audits complex reasoning chains for hidden structural biases or blind spots.',
    supportedTaskTypes: ['DEEP_REVIEW', 'ESCALATION'],
    inputSchema: {
      schemaId: 'schema.opus.deep_review.in',
      requiredFields: ['instruction'],
      optionalFields: ['reasoningArtifactId'],
      outputFormat: 'summary_report',
    },
    outputSchema: {
      schemaId: 'schema.opus.deep_review.out',
      requiredFields: ['auditFindings', 'integrityRating'],
      optionalFields: ['remediationSteps'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 11500,
    complexityLevel: 'HIGH',
    enabled: true,
  },
  decision_evaluation: {
    capabilityId: 'decision_evaluation',
    description: 'Evaluates proposed decision packages against strategic and risk criteria.',
    supportedTaskTypes: ['DECISION_EVALUATION', 'ESCALATION', 'DECISION_CHECK'],
    inputSchema: {
      schemaId: 'schema.shared.decision_evaluation.in',
      requiredFields: ['instruction'],
      optionalFields: ['decisionProposalId', 'riskEnvelope'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.shared.decision_evaluation.out',
      requiredFields: ['decisionCleared', 'evaluationScore'],
      optionalFields: ['conditions'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 9000,
    complexityLevel: 'HIGH',
    enabled: true,
  },

  // 5. Decision Engineer additional capabilities
  rule_validation: {
    capabilityId: 'rule_validation',
    description: 'Verifies strict compliance with operational guardrails and policy constraints.',
    supportedTaskTypes: ['RULE_VALIDATION', 'DECISION_CHECK'],
    inputSchema: {
      schemaId: 'schema.decision_engineer.rule_validation.in',
      requiredFields: ['instruction'],
      optionalFields: ['policyRuleSet'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.decision_engineer.rule_validation.out',
      requiredFields: ['rulesPassed', 'violationCount'],
      optionalFields: ['violationDetails'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 7500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  risk_assessment_simulation: {
    capabilityId: 'risk_assessment_simulation',
    description: 'Runs deterministic simulated exposure, drawdown, and limit checks.',
    supportedTaskTypes: ['RISK_ASSESSMENT_SIMULATION', 'DECISION_CHECK'],
    inputSchema: {
      schemaId: 'schema.decision_engineer.risk_assessment_simulation.in',
      requiredFields: ['instruction'],
      optionalFields: ['maxDrawdownLimit'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.decision_engineer.risk_assessment_simulation.out',
      requiredFields: ['simulatedRiskScore', 'withinLimits'],
      optionalFields: ['marginBufferRatio'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 8000,
    complexityLevel: 'HIGH',
    enabled: true,
  },
  decision_consistency_checks: {
    capabilityId: 'decision_consistency_checks',
    description: 'Cross-checks decision proposals for internal consistency and invariant safety.',
    supportedTaskTypes: ['DECISION_CONSISTENCY_CHECKS', 'DECISION_CHECK'],
    inputSchema: {
      schemaId: 'schema.decision_engineer.decision_consistency_checks.in',
      requiredFields: ['instruction'],
      optionalFields: ['priorDecisionIds'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.decision_engineer.decision_consistency_checks.out',
      requiredFields: ['isConsistent', 'consistencyIndex'],
      optionalFields: ['conflictNotes'],
      outputFormat: 'validation_verdict',
    },
    estimatedDurationMs: 7000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },

  // 6. Market Monitor capabilities
  market_monitoring_simulation: {
    capabilityId: 'market_monitoring_simulation',
    description: 'Simulates real-time surveillance of multi-asset volatility and spread feeds.',
    supportedTaskTypes: ['MARKET_MONITORING_SIMULATION', 'MARKET_WATCH'],
    inputSchema: {
      schemaId: 'schema.market_monitor.market_monitoring_simulation.in',
      requiredFields: ['instruction'],
      optionalFields: ['watchedSymbols'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.market_monitor.market_monitoring_simulation.out',
      requiredFields: ['feedSnapshot', 'spreadStatus'],
      optionalFields: ['volatilityIndex'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 6500,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  market_condition_detection: {
    capabilityId: 'market_condition_detection',
    description: 'Detects liquidity shifts, session transitions, and volatility compression.',
    supportedTaskTypes: ['MARKET_CONDITION_DETECTION', 'MARKET_WATCH'],
    inputSchema: {
      schemaId: 'schema.market_monitor.market_condition_detection.in',
      requiredFields: ['instruction'],
      optionalFields: ['sessionWindow'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.market_monitor.market_condition_detection.out',
      requiredFields: ['marketCondition', 'liquidityRegime'],
      optionalFields: ['regimeShiftDetected'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 7000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  anomaly_detection_simulation: {
    capabilityId: 'anomaly_detection_simulation',
    description: 'Flags simulated price spikes, spread widening, and statistical outliers.',
    supportedTaskTypes: ['ANOMALY_DETECTION_SIMULATION', 'MARKET_WATCH'],
    inputSchema: {
      schemaId: 'schema.market_monitor.anomaly_detection_simulation.in',
      requiredFields: ['instruction'],
      optionalFields: ['zScoreThreshold'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.market_monitor.anomaly_detection_simulation.out',
      requiredFields: ['anomalyDetected', 'maxZScore'],
      optionalFields: ['affectedPairs'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 6000,
    complexityLevel: 'MEDIUM',
    enabled: true,
  },
  market_event_reporting: {
    capabilityId: 'market_event_reporting',
    description: 'Generates structured simulated market alert dispatches for downstream rooms.',
    supportedTaskTypes: ['MARKET_EVENT_REPORTING', 'MARKET_WATCH'],
    inputSchema: {
      schemaId: 'schema.market_monitor.market_event_reporting.in',
      requiredFields: ['instruction'],
      optionalFields: ['severityLevel'],
      outputFormat: 'summary_report',
    },
    outputSchema: {
      schemaId: 'schema.market_monitor.market_event_reporting.out',
      requiredFields: ['eventReportId', 'alertHeadline'],
      optionalFields: ['recommendedWatchLevel'],
      outputFormat: 'summary_report',
    },
    estimatedDurationMs: 5500,
    complexityLevel: 'LOW',
    enabled: true,
  },

  // 7. Data Archivist capabilities
  data_archiving: {
    capabilityId: 'data_archiving',
    description: 'Commits completed task snapshots and telemetry into immutable simulated storage.',
    supportedTaskTypes: ['DATA_ARCHIVING', 'ARCHIVAL'],
    inputSchema: {
      schemaId: 'schema.data_archivist.data_archiving.in',
      requiredFields: ['instruction'],
      optionalFields: ['retentionTier'],
      outputFormat: 'archive_record',
    },
    outputSchema: {
      schemaId: 'schema.data_archivist.data_archiving.out',
      requiredFields: ['archiveDigestHash', 'storedRecordCount'],
      optionalFields: ['compressionFormat'],
      outputFormat: 'archive_record',
    },
    estimatedDurationMs: 6500,
    complexityLevel: 'LOW',
    enabled: true,
  },
  artifact_indexing: {
    capabilityId: 'artifact_indexing',
    description: 'Indexes reasoning artifacts, decision logs, and trace keys for fast lookup.',
    supportedTaskTypes: ['ARTIFACT_INDEXING', 'ARCHIVAL'],
    inputSchema: {
      schemaId: 'schema.data_archivist.artifact_indexing.in',
      requiredFields: ['instruction'],
      optionalFields: ['indexNamespace'],
      outputFormat: 'archive_record',
    },
    outputSchema: {
      schemaId: 'schema.data_archivist.artifact_indexing.out',
      requiredFields: ['indexKey', 'indexedFields'],
      optionalFields: ['partitionId'],
      outputFormat: 'archive_record',
    },
    estimatedDurationMs: 6000,
    complexityLevel: 'LOW',
    enabled: true,
  },
  historical_retrieval_simulation: {
    capabilityId: 'historical_retrieval_simulation',
    description: 'Simulates deterministic point-in-time retrieval of archived office logs.',
    supportedTaskTypes: ['HISTORICAL_RETRIEVAL_SIMULATION', 'ARCHIVAL'],
    inputSchema: {
      schemaId: 'schema.data_archivist.historical_retrieval_simulation.in',
      requiredFields: ['instruction'],
      optionalFields: ['simTimeRangeMs'],
      outputFormat: 'structured_json',
    },
    outputSchema: {
      schemaId: 'schema.data_archivist.historical_retrieval_simulation.out',
      requiredFields: ['matchedRecords', 'lookupLatencySimMs'],
      optionalFields: ['snapshotIntegrityVerified'],
      outputFormat: 'structured_json',
    },
    estimatedDurationMs: 5500,
    complexityLevel: 'LOW',
    enabled: true,
  },
  data_organization: {
    capabilityId: 'data_organization',
    description: 'Consolidates and normalizes ledger partitions and audit trail schemas.',
    supportedTaskTypes: ['DATA_ORGANIZATION', 'ARCHIVAL'],
    inputSchema: {
      schemaId: 'schema.data_archivist.data_organization.in',
      requiredFields: ['instruction'],
      optionalFields: ['compactionPolicy'],
      outputFormat: 'archive_record',
    },
    outputSchema: {
      schemaId: 'schema.data_archivist.data_organization.out',
      requiredFields: ['organizedPartitions', 'checksumValid'],
      optionalFields: ['reclaimedBlocks'],
      outputFormat: 'archive_record',
    },
    estimatedDurationMs: 7000,
    complexityLevel: 'LOW',
    enabled: true,
  },
});

const WORKER_CAPABILITY_ASSIGNMENTS: Readonly<
  Record<
    PermanentWorkerId,
    {
      readonly role: string;
      readonly maxConcurrency: number;
      readonly capabilityIds: readonly WorkerCapabilityId[];
    }
  >
> = deepFreeze({
  supervisor: {
    role: 'Central Router & Task Orchestrator',
    maxConcurrency: 2,
    capabilityIds: [
      'instruction_intake',
      'task_decomposition',
      'workflow_supervision',
      'task_assignment_oversight',
      'result_review',
    ],
  },
  haiku: {
    role: 'Fast Research & Intake Specialist',
    maxConcurrency: 2,
    capabilityIds: [
      'quick_research',
      'information_extraction',
      'summarization',
      'lightweight_classification',
    ],
  },
  sonnet: {
    role: 'Deep Quantitative & Structural Analyst',
    maxConcurrency: 1,
    capabilityIds: [
      'data_analysis',
      'comparison',
      'evaluation',
      'structured_reasoning',
    ],
  },
  opus: {
    role: 'High-Complexity Escalation Architect',
    maxConcurrency: 1,
    capabilityIds: [
      'complex_reasoning',
      'strategic_analysis',
      'deep_review',
      'decision_evaluation',
    ],
  },
  decision_engineer: {
    role: 'Risk Guardrail & Rule Validator',
    maxConcurrency: 1,
    capabilityIds: [
      'rule_validation',
      'decision_evaluation',
      'risk_assessment_simulation',
      'decision_consistency_checks',
    ],
  },
  market_monitor: {
    role: 'Real-Time Market Feed & Volatility Sentinel',
    maxConcurrency: 1,
    capabilityIds: [
      'market_monitoring_simulation',
      'market_condition_detection',
      'anomaly_detection_simulation',
      'market_event_reporting',
    ],
  },
  data_archivist: {
    role: 'Audit Ledger & Historical State Curator',
    maxConcurrency: 1,
    capabilityIds: [
      'data_archiving',
      'artifact_indexing',
      'historical_retrieval_simulation',
      'data_organization',
    ],
  },
});

function computeActiveSupportedTaskTypes(
  capabilities: readonly CapabilityDefinition[],
): readonly TaskType[] {
  const taskTypeSet = new Set<TaskType>();
  for (const capability of capabilities) {
    if (!capability.enabled) continue;
    for (const taskType of capability.supportedTaskTypes) {
      taskTypeSet.add(taskType);
    }
  }
  return deepFreeze(Array.from(taskTypeSet));
}

function buildWorkerCapabilityRegistry(
  overrides?: {
    readonly disabledWorkerIds?: readonly PermanentWorkerId[];
    readonly disabledCapabilityIds?: readonly WorkerCapabilityId[];
    readonly workerCapabilityDisableMap?: Partial<
      Record<PermanentWorkerId, readonly WorkerCapabilityId[]>
    >;
  },
): Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> {
  const disabledWorkers = new Set<PermanentWorkerId>(overrides?.disabledWorkerIds ?? []);
  const disabledCapabilities = new Set<WorkerCapabilityId>(
    overrides?.disabledCapabilityIds ?? [],
  );

  const profiles = {} as Record<PermanentWorkerId, WorkerCapabilityProfile>;

  for (const workerId of PERMANENT_WORKER_IDS) {
    const spec = WORKER_CAPABILITY_ASSIGNMENTS[workerId];
    const perWorkerDisabled = new Set<WorkerCapabilityId>(
      overrides?.workerCapabilityDisableMap?.[workerId] ?? [],
    );

    const capabilities: CapabilityDefinition[] = spec.capabilityIds.map((capId) => {
      const baseCap = CANONICAL_CAPABILITY_CATALOG[capId];
      const isCapEnabled =
        baseCap.enabled && !disabledCapabilities.has(capId) && !perWorkerDisabled.has(capId);
      return cloneCapabilityDefinition({
        ...baseCap,
        enabled: isCapEnabled,
      });
    });

    const workerEnabled = !disabledWorkers.has(workerId);
    const supportedTaskTypes = workerEnabled
      ? computeActiveSupportedTaskTypes(capabilities)
      : deepFreeze([] as TaskType[]);

    profiles[workerId] = deepFreeze({
      workerId,
      role: spec.role,
      capabilities: deepFreeze(capabilities),
      maxConcurrency: spec.maxConcurrency,
      supportedTaskTypes,
      enabled: workerEnabled,
    });
  }

  return deepFreeze(profiles);
}

const CANONICAL_WORKER_CAPABILITY_REGISTRY = buildWorkerCapabilityRegistry();

export function isPermanentWorkerId(workerId: string): workerId is PermanentWorkerId {
  return (PERMANENT_WORKER_IDS as readonly string[]).includes(workerId);
}

/**
 * 1. Get capability profile by workerId.
 * Returns a defensive deep-frozen clone (or null if workerId is not registered).
 */
export function getWorkerCapabilityProfile(
  workerId: WorkerId,
  registry: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> =
    CANONICAL_WORKER_CAPABILITY_REGISTRY,
): WorkerCapabilityProfile | null {
  if (!isPermanentWorkerId(workerId)) {
    return null;
  }
  const profile = registry[workerId];
  return profile ? cloneWorkerCapabilityProfile(profile) : null;
}

export const getCapabilityProfileByWorkerId = getWorkerCapabilityProfile;

/**
 * 2. Get list of all 7 worker capability profiles (defensive deep-frozen clones).
 */
export function getAllWorkerCapabilityProfiles(
  registry: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> =
    CANONICAL_WORKER_CAPABILITY_REGISTRY,
): WorkerCapabilityProfile[] {
  return PERMANENT_WORKER_IDS.map((workerId) =>
    cloneWorkerCapabilityProfile(registry[workerId]),
  );
}

/**
 * Get all unique CapabilityDefinitions registered in the canonical catalog.
 */
export function getAllCapabilities(options?: {
  readonly includeDisabled?: boolean;
}): CapabilityDefinition[] {
  const includeDisabled = options?.includeDisabled ?? true;
  return WORKER_CAPABILITY_IDS.map((id) => CANONICAL_CAPABILITY_CATALOG[id])
    .filter((cap) => (includeDisabled ? true : cap.enabled))
    .map(cloneCapabilityDefinition);
}

/**
 * Get capabilities assigned to a specific worker.
 */
export function getWorkerCapabilities(
  workerId: WorkerId,
  options?: {
    readonly includeDisabled?: boolean;
    readonly registry?: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>>;
  },
): CapabilityDefinition[] {
  const profile = getWorkerCapabilityProfile(workerId, options?.registry);
  if (!profile) return [];
  const includeDisabled = options?.includeDisabled ?? false;
  return profile.capabilities
    .filter((cap) => (includeDisabled ? true : cap.enabled))
    .map(cloneCapabilityDefinition);
}

/**
 * 3. Find capability definition by capabilityId.
 */
export function getCapabilityById(
  capabilityId: WorkerCapabilityId | string,
): CapabilityDefinition | null {
  if (!(WORKER_CAPABILITY_IDS as readonly string[]).includes(capabilityId)) {
    return null;
  }
  const def = CANONICAL_CAPABILITY_CATALOG[capabilityId as WorkerCapabilityId];
  return def ? cloneCapabilityDefinition(def) : null;
}

export const findCapabilityById = getCapabilityById;

/**
 * 4. Check whether a worker supports a specific taskType.
 * Disabled workers or disabled capabilities never count as active support.
 */
export function supportsTaskType(
  workerId: WorkerId,
  taskType: TaskType | string,
  registry: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> =
    CANONICAL_WORKER_CAPABILITY_REGISTRY,
): boolean {
  if (!isPermanentWorkerId(workerId)) {
    return false;
  }
  const profile = registry[workerId];
  if (!profile || !profile.enabled) {
    return false;
  }
  return profile.capabilities.some(
    (cap) => cap.enabled && (cap.supportedTaskTypes as readonly string[]).includes(taskType),
  );
}

export const workerSupportsTaskType = supportsTaskType;

/**
 * 5. Get all workers that actively support a specific taskType.
 * Preserves deterministic canonical worker ordering and excludes disabled capabilities/workers.
 */
export function getWorkersByTaskType(
  taskType: TaskType | string,
  registry: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> =
    CANONICAL_WORKER_CAPABILITY_REGISTRY,
): WorkerCapabilityProfile[] {
  return PERMANENT_WORKER_IDS.filter((workerId) =>
    supportsTaskType(workerId, taskType, registry),
  ).map((workerId) => cloneWorkerCapabilityProfile(registry[workerId]));
}

export const getWorkersSupportingTaskType = getWorkersByTaskType;

/**
 * Helper to create an isolated immutable registry snapshot with custom enabled/disabled flags
 * (used for testing disabled capabilities without mutating the canonical registry).
 */
export function createCustomCapabilityRegistry(overrides: {
  readonly disabledWorkerIds?: readonly PermanentWorkerId[];
  readonly disabledCapabilityIds?: readonly WorkerCapabilityId[];
  readonly workerCapabilityDisableMap?: Partial<
    Record<PermanentWorkerId, readonly WorkerCapabilityId[]>
  >;
}): Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>> {
  return buildWorkerCapabilityRegistry(overrides);
}

/**
 * Deterministic mapping between Phase 1.1 TaskCategory and Phase 2.1 canonical TaskType.
 */
const DEFAULT_CATEGORY_TO_TASK_TYPE: Readonly<Record<TaskCategory, TaskType>> = deepFreeze({
  ROUTING: 'INSTRUCTION_INTAKE',
  CLASSIFICATION: 'QUICK_RESEARCH',
  REASONING: 'DATA_ANALYSIS',
  ESCALATION: 'COMPLEX_REASONING',
  DECISION_CHECK: 'RULE_VALIDATION',
  MARKET_WATCH: 'MARKET_MONITORING_SIMULATION',
  ARCHIVAL: 'DATA_ARCHIVING',
});

const TASK_TYPE_TO_CATEGORY: Readonly<Record<TaskType, TaskCategory>> = deepFreeze({
  ROUTING: 'ROUTING',
  CLASSIFICATION: 'CLASSIFICATION',
  REASONING: 'REASONING',
  ESCALATION: 'ESCALATION',
  DECISION_CHECK: 'DECISION_CHECK',
  MARKET_WATCH: 'MARKET_WATCH',
  ARCHIVAL: 'ARCHIVAL',
  INSTRUCTION_INTAKE: 'ROUTING',
  TASK_DECOMPOSITION: 'ROUTING',
  WORKFLOW_SUPERVISION: 'ROUTING',
  TASK_ASSIGNMENT_OVERSIGHT: 'ROUTING',
  RESULT_REVIEW: 'ROUTING',
  QUICK_RESEARCH: 'CLASSIFICATION',
  INFORMATION_EXTRACTION: 'CLASSIFICATION',
  SUMMARIZATION: 'CLASSIFICATION',
  LIGHTWEIGHT_CLASSIFICATION: 'CLASSIFICATION',
  DATA_ANALYSIS: 'REASONING',
  COMPARISON: 'REASONING',
  EVALUATION: 'REASONING',
  STRUCTURED_REASONING: 'REASONING',
  COMPLEX_REASONING: 'ESCALATION',
  STRATEGIC_ANALYSIS: 'ESCALATION',
  DEEP_REVIEW: 'ESCALATION',
  DECISION_EVALUATION: 'DECISION_CHECK',
  RULE_VALIDATION: 'DECISION_CHECK',
  RISK_ASSESSMENT_SIMULATION: 'DECISION_CHECK',
  DECISION_CONSISTENCY_CHECKS: 'DECISION_CHECK',
  MARKET_MONITORING_SIMULATION: 'MARKET_WATCH',
  MARKET_CONDITION_DETECTION: 'MARKET_WATCH',
  ANOMALY_DETECTION_SIMULATION: 'MARKET_WATCH',
  MARKET_EVENT_REPORTING: 'MARKET_WATCH',
  DATA_ARCHIVING: 'ARCHIVAL',
  ARTIFACT_INDEXING: 'ARCHIVAL',
  HISTORICAL_RETRIEVAL_SIMULATION: 'ARCHIVAL',
  DATA_ORGANIZATION: 'ARCHIVAL',
});

export function mapCategoryToDefaultTaskType(category: TaskCategory): TaskType {
  return DEFAULT_CATEGORY_TO_TASK_TYPE[category] ?? 'INSTRUCTION_INTAKE';
}

export function mapTaskTypeToCategory(taskType: TaskType): TaskCategory {
  return TASK_TYPE_TO_CATEGORY[taskType] ?? 'REASONING';
}
