import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSimDuration,
  formatTokens,
  formatSimulatedCost,
  formatProgressPercent,
} from './formatters';

test('formatSimDuration legacy default format produces MM:SS without options', () => {
  assert.equal(formatSimDuration(0), '00:00');
  assert.equal(formatSimDuration(6000), '00:06');
  assert.equal(formatSimDuration(6500), '00:06'); // Legacy behavior floors to whole seconds
  assert.equal(formatSimDuration(7000), '00:07');
  assert.equal(formatSimDuration(59000), '00:59');
  assert.equal(formatSimDuration(60000), '01:00');
  assert.equal(formatSimDuration(3599000), '59:59');
});

test('formatSimDuration showFractionalSeconds produces MM:SS.s for sub-second precision', () => {
  assert.equal(formatSimDuration(0, { showFractionalSeconds: true }), '00:00.0');
  assert.equal(formatSimDuration(6000, { showFractionalSeconds: true }), '00:06.0');
  assert.equal(formatSimDuration(6500, { showFractionalSeconds: true }), '00:06.5');
  assert.equal(formatSimDuration(7000, { showFractionalSeconds: true }), '00:07.0');
  assert.equal(formatSimDuration(7120, { showFractionalSeconds: true }), '00:07.1');
  assert.equal(formatSimDuration(7980, { showFractionalSeconds: true }), '00:07.9');
});

test('formatSimDuration format over one hour produces HH:MM:SS and HH:MM:SS.s', () => {
  const oneHourOneMinOneSec = 3600000 + 60000 + 1000; // 3661000ms = 01:01:01
  assert.equal(formatSimDuration(oneHourOneMinOneSec), '01:01:01');
  assert.equal(
    formatSimDuration(oneHourOneMinOneSec, { showFractionalSeconds: true }),
    '01:01:01.0',
  );

  const oneHourOneMinOnePointFiveSec = 3661500; // 01:01:01.5
  assert.equal(formatSimDuration(oneHourOneMinOnePointFiveSec), '01:01:01');
  assert.equal(
    formatSimDuration(oneHourOneMinOnePointFiveSec, { showFractionalSeconds: true }),
    '01:01:01.5',
  );
});

test('formatSimDuration handles negative values cleanly', () => {
  assert.equal(formatSimDuration(-6000), '00:00');
  assert.equal(formatSimDuration(-6500), '00:00');
  assert.equal(formatSimDuration(-6000, { showFractionalSeconds: true }), '-00:06.0');
  assert.equal(formatSimDuration(-6500, { showFractionalSeconds: true }), '-00:06.5');
  assert.equal(formatSimDuration(-3661500, { showFractionalSeconds: true }), '-01:01:01.5');
});

test('formatTokens, formatSimulatedCost, and formatProgressPercent preserve expected behavior', () => {
  assert.equal(formatTokens(1234.5), '1,235');
  assert.equal(formatSimulatedCost(0.005), '$0.0050');
  assert.equal(formatSimulatedCost(0.05), '$0.050');
  assert.equal(formatProgressPercent(45.6), '46%');
  assert.equal(formatProgressPercent(-5), '0%');
  assert.equal(formatProgressPercent(105), '100%');
});
