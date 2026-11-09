import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseWorkforceReviewsResponse,
  parseWorkforceReviewDetail,
  parseWorkforceCommandResponse,
  type AdjudicateWorkforceReviewRequest,
} from './live.contracts';

const summary = {
  review_id: 'rev_12345678',
  task_id: 'task_12345678',
  attempt_id: 'attempt_12345678',
  status: 'PENDING',
  original_output_sha256: 'c'.repeat(64),
  adjusted_output_sha256: null,
  adjudicated_by: null,
  adjudicated_at: null,
  reason_code: null,
  notes: null,
  review_expires_at: '2026-11-11T00:00:00Z',
  created_at: '2026-11-10T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  payload_purged_at: null,
};

test('review list contract accepts exact pending response and rejects unknown fields or invalid hashes', () => {
  const response = {
    server_time_utc: '2026-11-10T00:00:00Z',
    total_count: 1,
    limit: 25,
    offset: 0,
    reviews: [summary],
  };
  assert.deepEqual(parseWorkforceReviewsResponse(response).reviews.length, 1);
  assert.throws(() => parseWorkforceReviewsResponse({ ...response, unsafe: true }));
  assert.throws(() => parseWorkforceReviewsResponse({
    ...response, reviews: [{ ...summary, original_output_sha256: 'not-a-hash' }],
  }));
});

test('review detail contract binds the requested review and accepts only JSON-object payloads', () => {
  const detail = { ...summary, original_output: { result: 'quarantined' }, adjusted_output: null };
  assert.deepEqual(parseWorkforceReviewDetail(detail, summary.review_id).original_output, { result: 'quarantined' });
  assert.throws(() => parseWorkforceReviewDetail(detail, 'rev_87654321'));
  assert.throws(() => parseWorkforceReviewDetail({ ...detail, original_output: ['not', 'object'] }, summary.review_id));
});

test('review adjudication command contract accepts only a terminal decision with matching identity and review', () => {
  const request: AdjudicateWorkforceReviewRequest = {
    review_id: summary.review_id,
    decision: 'APPROVED',
    expected_original_sha256: summary.original_output_sha256,
    adjusted_output: null,
    reason_code: null,
    notes: null,
  };
  const response = {
    command_id: 'cmd_12345678',
    actor_id: 'local_operator',
    command_type: 'REVIEW_ADJUDICATE',
    target_id: summary.review_id,
    correlation_id: 'corr_12345678',
    outcome: {
      accepted: true,
      review_id: summary.review_id,
      task_id: summary.task_id,
      decision: 'APPROVED',
      adjudicated_by: 'local_operator',
      adjudicated_at: '2026-11-10T00:00:00Z',
      task_status: 'COMPLETED',
    },
    created_at: '2026-11-10T00:00:00Z',
    replayed: false,
  };
  const parsed = parseWorkforceCommandResponse(
    response, '/api/v1/commands/reviews/adjudicate', request,
  );
  assert.equal(parsed.command_type, 'REVIEW_ADJUDICATE');
  assert.throws(() => parseWorkforceCommandResponse({
    ...response, target_id: 'rev_87654321',
  }, '/api/v1/commands/reviews/adjudicate', request));
});
