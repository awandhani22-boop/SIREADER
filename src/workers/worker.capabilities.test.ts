import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERMANENT_WORKER_IDS,
  WORKER_CAPABILITY_IDS,
} from '../tasks/task.types';
import {
  createCustomCapabilityRegistry,
  findCapabilityById,
  getAllCapabilities,
  getAllWorkerCapabilityProfiles,
  getCapabilityById,
  getWorkerCapabilities,
  getWorkerCapabilityProfile,
  getWorkersByTaskType,
  supportsTaskType,
} from './worker.capabilities';

/**
 * Automated Unit Tests for SIREADER Phase 2.1 — Worker Capability Registry
 * Covers all 10 mandatory requirements in Section 15.A:
 * 1. All seven workers are registered.
 * 2. Every worker has at least one capability.
 * 3. Capability IDs are unique.
 * 4. Worker lookup works accurately.
 * 5. Capability lookup works accurately.
 * 6. `supportsTaskType` returns true for supported task types.
 * 7. `supportsTaskType` returns false for unsupported task types.
 * 8. Query workers by task type returns the exact expected worker list.
 * 9. Disabled capabilities are never treated as active.
 * 10. Registry state cannot be mutated from outside.
 */

test('1. All seven permanent workers are registered in the Capability Registry', () => {
  const profiles = getAllWorkerCapabilityProfiles();
  assert.equal(profiles.length, 7);

  const registeredIds = profiles.map((p) => p.workerId);
  assert.deepEqual(registeredIds, [
    'supervisor',
    'haiku',
    'sonnet',
    'opus',
    'decision_engineer',
    'market_monitor',
    'data_archivist',
  ]);
  assert.deepEqual(registeredIds, [...PERMANENT_WORKER_IDS]);
});

test('2. Every registered worker has at least one capability and matches official Phase 2.1 capability assignments', () => {
  const expectedCapabilitiesByWorker: Record<string, string[]> = {
    supervisor: [
      'instruction_intake',
      'task_decomposition',
      'workflow_supervision',
      'task_assignment_oversight',
      'result_review',
    ],
    haiku: [
      'quick_research',
      'information_extraction',
      'summarization',
      'lightweight_classification',
    ],
    sonnet: [
      'data_analysis',
      'comparison',
      'evaluation',
      'structured_reasoning',
    ],
    opus: [
      'complex_reasoning',
      'strategic_analysis',
      'deep_review',
      'decision_evaluation',
    ],
    decision_engineer: [
      'rule_validation',
      'decision_evaluation',
      'risk_assessment_simulation',
      'decision_consistency_checks',
    ],
    market_monitor: [
      'market_monitoring_simulation',
      'market_condition_detection',
      'anomaly_detection_simulation',
      'market_event_reporting',
    ],
    data_archivist: [
      'data_archiving',
      'artifact_indexing',
      'historical_retrieval_simulation',
      'data_organization',
    ],
  };

  for (const workerId of PERMANENT_WORKER_IDS) {
    const profile = getWorkerCapabilityProfile(workerId);
    assert.ok(profile, `Expected profile for ${workerId}`);
    assert.ok(profile.capabilities.length >= 1, `${workerId} must have >= 1 capability`);
    assert.ok(profile.maxConcurrency >= 1);
    assert.equal(profile.enabled, true);

    const capabilityIds = profile.capabilities.map((c) => c.capabilityId);
    assert.deepEqual(capabilityIds, expectedCapabilitiesByWorker[workerId]);
  }
});

test('3. Capability IDs are unique in the canonical catalog and within every worker profile', () => {
  const allCapabilities = getAllCapabilities();
  assert.equal(allCapabilities.length, WORKER_CAPABILITY_IDS.length);

  const catalogIds = allCapabilities.map((c) => c.capabilityId);
  const uniqueCatalogIds = new Set(catalogIds);
  assert.equal(uniqueCatalogIds.size, catalogIds.length);

  for (const profile of getAllWorkerCapabilityProfiles()) {
    const workerCapIds = profile.capabilities.map((c) => c.capabilityId);
    const uniqueWorkerCapIds = new Set(workerCapIds);
    assert.equal(
      uniqueWorkerCapIds.size,
      workerCapIds.length,
      `Duplicate capabilityId detected in worker ${profile.workerId}`,
    );
  }
});

test('4. Worker lookup by workerId returns accurate profile and null for unknown IDs', () => {
  const supervisor = getWorkerCapabilityProfile('supervisor');
  assert.ok(supervisor);
  assert.equal(supervisor.workerId, 'supervisor');
  assert.equal(supervisor.capabilities.length, 5);

  const archivist = getWorkerCapabilityProfile('data_archivist');
  assert.ok(archivist);
  assert.equal(archivist.workerId, 'data_archivist');
  assert.equal(archivist.capabilities.length, 4);

  const unknown = getWorkerCapabilityProfile('unknown_worker');
  assert.equal(unknown, null);
});

test('5. Capability lookup by capabilityId returns full capability metadata and null for unknown IDs', () => {
  for (const capId of WORKER_CAPABILITY_IDS) {
    const def = getCapabilityById(capId);
    assert.ok(def, `Expected capability definition for ${capId}`);
    assert.equal(def.capabilityId, capId);
    assert.ok(def.description.length > 0);
    assert.ok(def.supportedTaskTypes.length >= 1);
    assert.ok(def.estimatedDurationMs > 0);
    assert.ok(def.inputSchema.schemaId.length > 0);
    assert.ok(def.outputSchema.schemaId.length > 0);
    assert.equal(def.enabled, true);
  }

  assert.equal(findCapabilityById('non_existent_capability'), null);
});

test('6. supportsTaskType returns true for task types supported by a worker', () => {
  assert.equal(supportsTaskType('supervisor', 'INSTRUCTION_INTAKE'), true);
  assert.equal(supportsTaskType('supervisor', 'TASK_DECOMPOSITION'), true);
  assert.equal(supportsTaskType('haiku', 'QUICK_RESEARCH'), true);
  assert.equal(supportsTaskType('sonnet', 'STRUCTURED_REASONING'), true);
  assert.equal(supportsTaskType('opus', 'COMPLEX_REASONING'), true);
  assert.equal(supportsTaskType('opus', 'DECISION_EVALUATION'), true);
  assert.equal(supportsTaskType('decision_engineer', 'DECISION_EVALUATION'), true);
  assert.equal(supportsTaskType('decision_engineer', 'RISK_ASSESSMENT_SIMULATION'), true);
  assert.equal(supportsTaskType('market_monitor', 'ANOMALY_DETECTION_SIMULATION'), true);
  assert.equal(supportsTaskType('data_archivist', 'HISTORICAL_RETRIEVAL_SIMULATION'), true);
});

test('7. supportsTaskType returns false for unsupported task types or unknown workers', () => {
  assert.equal(supportsTaskType('haiku', 'COMPLEX_REASONING'), false);
  assert.equal(supportsTaskType('market_monitor', 'DATA_ARCHIVING'), false);
  assert.equal(supportsTaskType('data_archivist', 'INSTRUCTION_INTAKE'), false);
  assert.equal(supportsTaskType('supervisor', 'ANOMALY_DETECTION_SIMULATION'), false);
  assert.equal(supportsTaskType('unknown_worker', 'QUICK_RESEARCH'), false);
  assert.equal(supportsTaskType('sonnet', 'UNKNOWN_TASK_TYPE'), false);
});

test('8. Query workers by task type returns the exact list of supporting workers', () => {
  const quickResearchWorkers = getWorkersByTaskType('QUICK_RESEARCH').map(
    (w) => w.workerId,
  );
  assert.deepEqual(quickResearchWorkers, ['haiku']);

  // DECISION_EVALUATION is supported by both opus and decision_engineer
  const decisionEvalWorkers = getWorkersByTaskType('DECISION_EVALUATION').map(
    (w) => w.workerId,
  );
  assert.deepEqual(decisionEvalWorkers, ['opus', 'decision_engineer']);

  const archivingWorkers = getWorkersByTaskType('DATA_ARCHIVING').map(
    (w) => w.workerId,
  );
  assert.deepEqual(archivingWorkers, ['data_archivist']);

  const unsupportedWorkers = getWorkersByTaskType('NON_EXISTENT_TASK');
  assert.deepEqual(unsupportedWorkers, []);
});

test('9. Disabled capability or disabled worker is never treated as active', () => {
  // Disable `quick_research` globally and `decision_evaluation` specifically on `opus`
  const customRegistry = createCustomCapabilityRegistry({
    disabledCapabilityIds: ['quick_research'],
    workerCapabilityDisableMap: {
      opus: ['decision_evaluation'],
    },
    disabledWorkerIds: ['market_monitor'],
  });

  // Haiku should no longer support QUICK_RESEARCH, but still supports SUMMARIZATION
  assert.equal(supportsTaskType('haiku', 'QUICK_RESEARCH', customRegistry), false);
  assert.equal(supportsTaskType('haiku', 'SUMMARIZATION', customRegistry), true);

  const activeHaikuCaps = getWorkerCapabilities('haiku', {
    includeDisabled: false,
    registry: customRegistry,
  }).map((c) => c.capabilityId);
  assert.equal(activeHaikuCaps.includes('quick_research'), false);

  // Opus disabled decision_evaluation -> only decision_engineer remains for DECISION_EVALUATION
  const decisionWorkers = getWorkersByTaskType(
    'DECISION_EVALUATION',
    customRegistry,
  ).map((w) => w.workerId);
  assert.deepEqual(decisionWorkers, ['decision_engineer']);

  // Disabled worker market_monitor does not support any task type
  assert.equal(
    supportsTaskType('market_monitor', 'MARKET_MONITORING_SIMULATION', customRegistry),
    false,
  );
  assert.deepEqual(
    getWorkersByTaskType('MARKET_MONITORING_SIMULATION', customRegistry),
    [],
  );

  // Canonical registry remains completely unaffected
  assert.equal(supportsTaskType('haiku', 'QUICK_RESEARCH'), true);
  assert.equal(supportsTaskType('market_monitor', 'MARKET_MONITORING_SIMULATION'), true);
});

test('10. Registry state is deeply frozen and cannot be mutated from outside', () => {
  const profile = getWorkerCapabilityProfile('supervisor');
  assert.ok(profile);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.capabilities), true);
  assert.equal(Object.isFrozen(profile.supportedTaskTypes), true);

  assert.throws(() => {
    (profile as { enabled: boolean }).enabled = false;
  }, TypeError);

  assert.throws(() => {
    (profile.capabilities as unknown as unknown[]).push({});
  }, TypeError);

  assert.throws(() => {
    (profile.capabilities[0].supportedTaskTypes as unknown as string[]).push(
      'DATA_ARCHIVING',
    );
  }, TypeError);

  // Re-query to verify canonical state is untouched
  const freshProfile = getWorkerCapabilityProfile('supervisor');
  assert.ok(freshProfile);
  assert.equal(freshProfile.enabled, true);
  assert.equal(freshProfile.capabilities.length, 5);
});
