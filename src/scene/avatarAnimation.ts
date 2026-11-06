import * as THREE from 'three';
import { SimulationEngine } from '../workers/simulation.engine';
import {
  AnimationClipKey,
  SimulationSnapshot,
  WorkerId,
  WorkerStatus,
} from '../workers/worker.types';

/**
 * Unified Simulation & Avatar Animation Clock + GLB Mixer Controller (Phase 1.1 Final Audit)
 *
 * Fix 1 — Unified Time Source:
 * - `SimulationEngine` is the single source of truth for simulation time (`simTimeMs`).
 * - `stepAvatarClockFromEngine` advances each worker's `AvatarSimClockState` strictly
 *   by the simulation-time delta (`deltaSimMs / 1000`) derived from `SimulationEngine.getUnifiedSimTimeMs`.
 * - Browser FPS drops never cause avatar animation time to drift away from `SimulationEngine.simTimeMs`
 *   because `stepAvatarClockFromEngine` telescopes exact engine simulation timestamps rather than
 *   accumulating separately-clamped wall-clock `useFrame` deltas.
 * - Reset (`SimulationEngine.resetToBaseline`) restores `simTimeMs = 0, tickCount = 0` and restores
 *   every worker's deterministic `initialPhaseSec` (and GLB mixer time `0`).
 *
 * Fix 2 — Direct GLB `THREE.AnimationMixer` Synchronization (`GlbAvatarAnimationController`):
 * - Replaces `@react-three/drei`'s `useAnimations` (which registered an internal
 *   `useFrame((state, delta) => mixer.update(delta))` before component `useFrame` hooks,
 *   causing an extra unintended wall-clock update on the frame Global Pause engaged).
 * - Owns a real `THREE.AnimationMixer` and updates it exclusively via `stepFromSimulation`
 *   after checking `isGlobalPaused`, `worker.status === 'PAUSED'`, and `reducedMotion`.
 * - Tracks `activeClipName` and `actionStartCount` so pausing, resuming, or changing speed
 *   never restarts a running `THREE.AnimationAction` unnecessarily.
 */

export const MAX_ANIM_FRAME_DELTA_SEC = 0.1;

export interface HumanoidPoseAngles {
  rootOffsetY: number;
  torsoRotX: number;
  headRotX: number;
  headRotY: number;
  leftArmRotX: number;
  rightArmRotX: number;
  leftForearmRotX: number;
  rightForearmRotX: number;
  leftLegRotX: number;
  rightLegRotX: number;
  beaconRotY: number;
}

export interface AvatarSimClockState {
  readonly workerId: string;
  readonly initialPhaseSec: number;
  animTimeSec: number;
  lastEngineSimTimeMs: number;
}

export interface AvatarClockStepResult {
  animTimeSec: number;
  simDeltaSec: number;
  isFrozen: boolean;
  didReset: boolean;
}

/**
 * Computes the deterministic initial animation phase (in seconds) for a worker ID.
 */
export function computeWorkerInitialPhaseSec(workerId: string): number {
  const raw =
    workerId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) * 0.37;
  return Number(raw.toFixed(4));
}

/**
 * Creates a fresh per-worker `AvatarSimClockState` anchored to the current `SimulationEngine` state.
 */
export function createAvatarSimClockState(
  workerId: string,
  initialSnapshot?: Pick<SimulationSnapshot, 'simTimeMs'>,
): AvatarSimClockState {
  const initialPhaseSec = computeWorkerInitialPhaseSec(workerId);
  return {
    workerId,
    initialPhaseSec,
    animTimeSec: initialPhaseSec,
    lastEngineSimTimeMs: initialSnapshot ? initialSnapshot.simTimeMs : 0,
  };
}

export function shouldFreezeWorkerAnimation(
  isGlobalPaused: boolean,
  workerStatus: WorkerStatus,
  reducedMotion: boolean,
): boolean {
  return isGlobalPaused || workerStatus === 'PAUSED' || reducedMotion;
}

/**
 * Advances a worker's `AvatarSimClockState` using `SimulationEngine` as the single source of truth.
 *
 * - On Reset (`simTimeMs === 0 && tickCount === 0` after advancing, or `unifiedSimTimeMs < lastEngineSimTimeMs`),
 *   restores `animTimeSec = initialPhaseSec` deterministically.
 * - Computes `deltaSimMs = Math.max(0, unifiedSimTimeMs - clockState.lastEngineSimTimeMs)`.
 * - If `workerStatus === 'PAUSED'` or `reducedMotion === true`, advances `lastEngineSimTimeMs`
 *   to `unifiedSimTimeMs` while keeping `animTimeSec` frozen (`simDeltaSec = 0`), so when the
 *   worker is later resumed, its animation continues from its exact paused phase without jumping.
 * - If `isGlobalPaused === true` and `deltaSimMs === 0`, freezes completely (`simDeltaSec = 0`).
 *   (If the operator clicked manual `Step +0.5s` while globally paused, `deltaSimMs === 500`,
 *   which advances unpaused workers by the exact `+0.5s` step and then freezes.)
 */
export function stepAvatarClockFromEngine(
  clockState: AvatarSimClockState,
  snapshot: SimulationSnapshot,
  workerId: WorkerId,
  reducedMotion: boolean,
  nowWallTimeMs?: number,
): AvatarClockStepResult {
  const unifiedSimTimeMs = SimulationEngine.getUnifiedSimTimeMs(
    snapshot,
    nowWallTimeMs,
  );
  const worker = snapshot.workers[workerId];
  const workerStatus: WorkerStatus = worker ? worker.status : 'IDLE';

  const isResetToZero =
    unifiedSimTimeMs < clockState.lastEngineSimTimeMs ||
    (snapshot.simTimeMs === 0 &&
      snapshot.tickCount === 0 &&
      (clockState.lastEngineSimTimeMs > 0 ||
        clockState.animTimeSec !== clockState.initialPhaseSec));

  if (isResetToZero) {
    clockState.lastEngineSimTimeMs = unifiedSimTimeMs;
    clockState.animTimeSec =
      unifiedSimTimeMs > 0 &&
      !shouldFreezeWorkerAnimation(
        snapshot.isGlobalPaused,
        workerStatus,
        reducedMotion,
      )
        ? Number((clockState.initialPhaseSec + unifiedSimTimeMs / 1000).toFixed(6))
        : clockState.initialPhaseSec;

    return {
      animTimeSec: clockState.animTimeSec,
      simDeltaSec: 0,
      isFrozen: shouldFreezeWorkerAnimation(
        snapshot.isGlobalPaused,
        workerStatus,
        reducedMotion,
      ),
      didReset: true,
    };
  }

  const deltaSimMs = Math.max(
    0,
    unifiedSimTimeMs - clockState.lastEngineSimTimeMs,
  );
  clockState.lastEngineSimTimeMs = Math.max(
    clockState.lastEngineSimTimeMs,
    unifiedSimTimeMs,
  );

  // If worker is individually paused or reducedMotion is enabled, freeze this worker's animation
  if (workerStatus === 'PAUSED' || reducedMotion) {
    return {
      animTimeSec: clockState.animTimeSec,
      simDeltaSec: 0,
      isFrozen: true,
      didReset: false,
    };
  }

  // If globally paused and no manual step occurred, freeze completely
  if (snapshot.isGlobalPaused && deltaSimMs === 0) {
    return {
      animTimeSec: clockState.animTimeSec,
      simDeltaSec: 0,
      isFrozen: true,
      didReset: false,
    };
  }

  const simDeltaSec = deltaSimMs / 1000;
  clockState.animTimeSec = Number(
    (clockState.animTimeSec + simDeltaSec).toFixed(6),
  );

  return {
    animTimeSec: clockState.animTimeSec,
    simDeltaSec,
    isFrozen: snapshot.isGlobalPaused,
    didReset: false,
  };
}

/**
 * Direct GLB `THREE.AnimationMixer` Controller (Fix 2)
 *
 * Replaces `@react-three/drei`'s `useAnimations` so that:
 * 1. No internal `useFrame((state, delta) => mixer.update(delta))` is registered ahead of our
 *    simulation check, eliminating the extra unintended frame update on Global Pause.
 * 2. Updates the real `THREE.AnimationMixer` strictly using `simDeltaSec` derived from
 *    `SimulationEngine` via `stepAvatarClockFromEngine`.
 * 3. Preserves the running `THREE.AnimationAction` across pause/resume and speed changes
 *    without restarting (`action.reset().play()`) unless the target clip name actually changes.
 */
export class GlbAvatarAnimationController {
  public readonly mixer: THREE.AnimationMixer;
  public readonly root: THREE.Object3D;
  public readonly clips: THREE.AnimationClip[];
  private actionsByName: Map<string, THREE.AnimationAction> = new Map();
  private activeClipName: string | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  public updateCallCount = 0;
  public actionStartCount = 0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.root = root;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(root);

    for (const clip of clips) {
      const action = this.mixer.clipAction(clip, root);
      this.actionsByName.set(clip.name, action);
    }
  }

  public getActiveClipName(): string | null {
    return this.activeClipName;
  }

  public getActiveAction(): THREE.AnimationAction | null {
    return this.activeAction;
  }

  /**
   * Transitions to the clip mapped for `animationState` ONLY if the resolved clip name
   * differs from `activeClipName`. Does NOT restart the action when pause state or speed changes.
   */
  public syncClip(
    animationState: AnimationClipKey,
    animationMap: Record<AnimationClipKey, string>,
  ): THREE.AnimationAction | null {
    const requestedName = animationMap[animationState];
    const targetClipName =
      requestedName && this.actionsByName.has(requestedName)
        ? requestedName
        : this.clips[0]?.name ?? null;

    if (!targetClipName) {
      return null;
    }

    // Do not restart if the same clip is already active and running
    if (
      this.activeClipName === targetClipName &&
      this.activeAction &&
      this.activeAction.isRunning()
    ) {
      return this.activeAction;
    }

    const nextAction = this.actionsByName.get(targetClipName) ?? null;
    if (!nextAction) {
      return null;
    }

    if (this.activeAction && this.activeAction !== nextAction) {
      this.activeAction.fadeOut(0.2);
    }

    nextAction.reset();
    nextAction.fadeIn(0.2);
    nextAction.play();

    this.activeClipName = targetClipName;
    this.activeAction = nextAction;
    this.actionStartCount += 1;
    return nextAction;
  }

  /**
   * Advances the underlying `THREE.AnimationMixer` using the unified `SimulationEngine` clock.
   * Guarantees zero mixer updates while globally paused or worker-paused, and deterministic
   * reset when `SimulationEngine.resetToBaseline` is triggered.
   */
  public stepFromSimulation(
    clockState: AvatarSimClockState,
    snapshot: SimulationSnapshot,
    workerId: WorkerId,
    reducedMotion: boolean,
    nowWallTimeMs?: number,
  ): AvatarClockStepResult {
    const stepResult = stepAvatarClockFromEngine(
      clockState,
      snapshot,
      workerId,
      reducedMotion,
      nowWallTimeMs,
    );

    if (stepResult.didReset) {
      this.mixer.setTime(0);
      if (this.activeAction) {
        this.activeAction.time = 0;
      }
      this.mixer.update(0);
      return stepResult;
    }

    if (stepResult.isFrozen && stepResult.simDeltaSec <= 0) {
      this.mixer.timeScale = 0;
      return stepResult;
    }

    if (stepResult.simDeltaSec <= 0) {
      return stepResult;
    }

    // simDeltaSec is already scaled by SimulationEngine's simSpeedMultiplier (1x, 2x, 4x)
    this.mixer.timeScale = 1;
    this.mixer.update(stepResult.simDeltaSec);
    this.updateCallCount += 1;
    return stepResult;
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actionsByName.clear();
    this.activeAction = null;
    this.activeClipName = null;
  }
}

/**
 * Helper for advancing a worker's controlled animation clock directly from a delta.
 */
export function advanceAvatarAnimClock(params: {
  currentAnimTimeSec: number;
  rawDeltaSec: number;
  isGlobalPaused: boolean;
  workerStatus: WorkerStatus;
  reducedMotion: boolean;
  simSpeedMultiplier: 1 | 2 | 4;
}): number {
  const {
    currentAnimTimeSec,
    rawDeltaSec,
    isGlobalPaused,
    workerStatus,
    reducedMotion,
    simSpeedMultiplier,
  } = params;

  if (shouldFreezeWorkerAnimation(isGlobalPaused, workerStatus, reducedMotion)) {
    return currentAnimTimeSec;
  }

  const clampedDeltaSec = Math.max(
    0,
    Math.min(rawDeltaSec, MAX_ANIM_FRAME_DELTA_SEC),
  );
  return currentAnimTimeSec + clampedDeltaSec * simSpeedMultiplier;
}

export function computeGlbMixerTimeScale(params: {
  isGlobalPaused: boolean;
  workerStatus: WorkerStatus;
  reducedMotion: boolean;
  simSpeedMultiplier: 1 | 2 | 4;
}): number {
  if (
    shouldFreezeWorkerAnimation(
      params.isGlobalPaused,
      params.workerStatus,
      params.reducedMotion,
    )
  ) {
    return 0;
  }
  return params.simSpeedMultiplier;
}

export function updateGlbMixerWithSimClock(
  mixer: { update: (deltaSec: number) => void; timeScale?: number },
  params: {
    rawDeltaSec: number;
    isGlobalPaused: boolean;
    workerStatus: WorkerStatus;
    reducedMotion: boolean;
    simSpeedMultiplier: 1 | 2 | 4;
  },
): number {
  const timeScale = computeGlbMixerTimeScale(params);
  if ('timeScale' in mixer) {
    mixer.timeScale = timeScale;
  }
  if (timeScale === 0) {
    return 0;
  }
  const clampedDelta = Math.max(
    0,
    Math.min(params.rawDeltaSec, MAX_ANIM_FRAME_DELTA_SEC),
  );
  const effectiveDelta = clampedDelta * timeScale;
  mixer.update(effectiveDelta);
  return effectiveDelta;
}

/**
 * Pure deterministic function mapping `(animationState, animTimeSec)` to
 * 12-part articulated humanoid joint angles.
 */
export function computeHumanoidPose(
  anim: AnimationClipKey,
  animTimeSec: number,
  isPaused: boolean,
): HumanoidPoseAngles {
  const t = animTimeSec;
  const beaconRotY = t * 1.8;

  if (anim === 'walking') {
    return {
      rootOffsetY: 0.04 + Math.abs(Math.sin(t * 7)) * 0.035,
      torsoRotX: 0.08,
      headRotX: 0,
      headRotY: Math.sin(t * 2.5) * 0.12,
      leftArmRotX: Math.sin(t * 7) * 0.45,
      rightArmRotX: -Math.sin(t * 7) * 0.45,
      leftForearmRotX: -0.35,
      rightForearmRotX: -0.35,
      leftLegRotX: -Math.sin(t * 7) * 0.5,
      rightLegRotX: Math.sin(t * 7) * 0.5,
      beaconRotY,
    };
  }

  if (anim === 'typing') {
    return {
      rootOffsetY: -0.14,
      torsoRotX: -0.12 + Math.sin(t * 2.2) * 0.02,
      headRotX: 0.1 + Math.sin(t * 3.1) * 0.03,
      headRotY: Math.sin(t * 1.4) * 0.14,
      leftArmRotX: -0.68 + Math.sin(t * 14) * 0.07,
      rightArmRotX: -0.68 + Math.cos(t * 14) * 0.07,
      leftForearmRotX: -0.62 + Math.sin(t * 18) * 0.09,
      rightForearmRotX: -0.62 + Math.cos(t * 18) * 0.09,
      leftLegRotX: -1.35,
      rightLegRotX: -1.35,
      beaconRotY,
    };
  }

  if (anim === 'talking') {
    return {
      rootOffsetY: -0.14,
      torsoRotX: -0.05,
      headRotX: Math.sin(t * 4.5) * 0.07,
      headRotY: Math.sin(t * 2.2) * 0.22,
      leftArmRotX: -0.55 + Math.sin(t * 5.2) * 0.18,
      rightArmRotX: -0.55 + Math.cos(t * 4.8) * 0.18,
      leftForearmRotX: -0.5 + Math.sin(t * 5.2) * 0.15,
      rightForearmRotX: -0.5 + Math.cos(t * 4.8) * 0.15,
      leftLegRotX: -1.35,
      rightLegRotX: -1.35,
      beaconRotY,
    };
  }

  // Default: 'seated' or 'idle'
  return {
    rootOffsetY: -0.14,
    torsoRotX: Math.sin(t * 1.6) * 0.025,
    headRotX: 0.04,
    headRotY: isPaused ? 0 : Math.sin(t * 0.9) * 0.1,
    leftArmRotX: -0.35,
    rightArmRotX: -0.35,
    leftForearmRotX: -0.45,
    rightForearmRotX: -0.45,
    leftLegRotX: -1.35,
    rightLegRotX: -1.35,
    beaconRotY,
  };
}
