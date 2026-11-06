import { AnimationClipKey, WorkerStatus } from '../workers/worker.types';

/**
 * Controlled Avatar Animation Clock & Pose Kinematics (Fix A)
 *
 * Ensures that:
 * 1. Global Pause (`isGlobalPaused === true`) freezes ALL visual animations
 *    (placeholder joints, overhead beacon, GLB animation mixer, and workstation rings).
 * 2. Individual Worker Pause (`workerStatus === 'PAUSED'`) freezes only that worker's
 *    visual animation while unpaused workers continue animating.
 * 3. Animation time never uses Three.js wall-clock `state.clock.elapsedTime`, so
 *    pausing and resuming continues from the exact previous animation phase without jumping.
 * 4. Speed multiplier (`1x`, `2x`, `4x`) scales simulation animation delta consistently.
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

export function shouldFreezeWorkerAnimation(
  isGlobalPaused: boolean,
  workerStatus: WorkerStatus,
  reducedMotion: boolean,
): boolean {
  return isGlobalPaused || workerStatus === 'PAUSED' || reducedMotion;
}

/**
 * Advances a worker's controlled animation clock (`currentAnimTimeSec`) by a frame
 * delta only when neither Global Pause, Worker Pause, nor Reduced Motion is active.
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

  const clampedDeltaSec = Math.max(0, Math.min(rawDeltaSec, MAX_ANIM_FRAME_DELTA_SEC));
  return currentAnimTimeSec + clampedDeltaSec * simSpeedMultiplier;
}

/**
 * Computes the effective timeScale for a Three.js GLB AnimationMixer.
 * Returns `0` when globally paused, worker-paused, or in reduced-motion mode;
 * otherwise returns `simSpeedMultiplier`.
 */
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

/**
 * Advances a Three.js-compatible AnimationMixer (`update(deltaSec)`) using the
 * controlled simulation animation delta. Does not advance when frozen.
 */
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
  const clampedDelta = Math.max(0, Math.min(params.rawDeltaSec, MAX_ANIM_FRAME_DELTA_SEC));
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
