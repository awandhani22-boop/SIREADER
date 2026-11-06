import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { recordWorkerComponentRender } from '../utils/renderProfiler';
import { useOfficeStore } from '../workers/worker.state';
import { WorkerEntity, WorkerId } from '../workers/worker.types';
import {
  AvatarSimClockState,
  computeHumanoidPose,
  createAvatarSimClockState,
  GlbAvatarAnimationController,
  stepAvatarClockFromEngine,
} from './avatarAnimation';
import {
  AvatarModelErrorBoundary,
  resolveAvatarRenderMode,
} from './avatarErrorBoundary';

/**
 * WorkerAvatar Component (Phase 1.1 Final Audit — Unified Simulation Clock & Direct GLB Mixer)
 *
 * - Fix 1 (Unified Simulation & Avatar Animation Time):
 *   Both `ArticulatedHumanoidPlaceholder` and `RiggedGlbAvatar` advance strictly from
 *   `SimulationEngine`'s authoritative simulation time via `stepAvatarClockFromEngine`.
 *   Browser FPS drops never cause animation time to drift away from simulation time,
 *   Reset restores deterministic `initialPhaseSec` phases, and React state is never
 *   updated at 60Hz.
 * - Fix 2 (Direct GLB `THREE.AnimationMixer` Synchronization):
 *   `RiggedGlbAvatar` uses `GlbAvatarAnimationController` instead of `@react-three/drei`'s
 *   `useAnimations`, preventing `useAnimations`'s internal `useFrame` from firing an
 *   extra unintended animation update on Global Pause and preventing unnecessary
 *   `AnimationAction` restarts on pause/resume or speed changes.
 */

export interface WorkerAvatarProps {
  worker: WorkerEntity;
  isSelected: boolean;
  reducedMotion: boolean;
  avatarLoadError?: string;
  onSelectWorker: (workerId: WorkerId) => void;
  onModelError?: (
    workerId: WorkerId,
    modelUrl: string,
    errorMessage: string,
  ) => void;
}

interface RiggedGlbModelProps {
  modelUrl: string;
  worker: WorkerEntity;
  reducedMotion: boolean;
}

function RiggedGlbAvatar({
  modelUrl,
  worker,
  reducedMotion,
}: RiggedGlbModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelUrl);

  const controller = useMemo(
    () => new GlbAvatarAnimationController(scene, animations),
    [scene, animations],
  );

  const clockStateRef = useRef<AvatarSimClockState>(
    createAvatarSimClockState(worker.id, useOfficeStore.getState()),
  );

  // Sync active clip ONLY when animationState or animationMap changes (never restarts on pause/speed)
  useEffect(() => {
    controller.syncClip(worker.animationState, worker.avatarConfig.animationMap);
  }, [controller, worker.animationState, worker.avatarConfig.animationMap]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  // Single unified useFrame driven by SimulationEngine time (no competing useAnimations useFrame)
  useFrame(() => {
    const storeState = useOfficeStore.getState();
    controller.stepFromSimulation(
      clockStateRef.current,
      storeState,
      worker.id,
      reducedMotion,
      performance.now(),
    );
  });

  return (
    <group ref={groupRef} name={`RiggedGlb_${worker.id}`}>
      <primitive object={scene} scale={1} />
    </group>
  );
}

interface ArticulatedHumanoidPlaceholderProps {
  worker: WorkerEntity;
  isSelected: boolean;
  reducedMotion: boolean;
}

function ArticulatedHumanoidPlaceholder({
  worker,
  isSelected,
  reducedMotion,
}: ArticulatedHumanoidPlaceholderProps) {
  const rootRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const clockStateRef = useRef<AvatarSimClockState>(
    createAvatarSimClockState(worker.id, useOfficeStore.getState()),
  );

  useFrame(() => {
    if (
      !rootRef.current ||
      !torsoRef.current ||
      !headRef.current ||
      !leftArmRef.current ||
      !rightArmRef.current ||
      !leftForearmRef.current ||
      !rightForearmRef.current ||
      !leftLegRef.current ||
      !rightLegRef.current
    ) {
      return;
    }

    const storeState = useOfficeStore.getState();
    const { animTimeSec, isFrozen } = stepAvatarClockFromEngine(
      clockStateRef.current,
      storeState,
      worker.id,
      reducedMotion,
      performance.now(),
    );

    const pose = computeHumanoidPose(
      worker.animationState,
      animTimeSec,
      isFrozen,
    );

    if (beaconRef.current) {
      beaconRef.current.rotation.y = pose.beaconRotY;
    }

    rootRef.current.position.y = pose.rootOffsetY;
    torsoRef.current.rotation.x = pose.torsoRotX;
    headRef.current.rotation.x = pose.headRotX;
    headRef.current.rotation.y = pose.headRotY;

    leftArmRef.current.rotation.x = pose.leftArmRotX;
    rightArmRef.current.rotation.x = pose.rightArmRotX;
    leftForearmRef.current.rotation.x = pose.leftForearmRotX;
    rightForearmRef.current.rotation.x = pose.rightForearmRotX;

    leftLegRef.current.rotation.x = pose.leftLegRotX;
    rightLegRef.current.rotation.x = pose.rightLegRotX;
  });

  const { accentColor, suitColor } = worker.avatarConfig;
  const isPaused = worker.status === 'PAUSED';

  return (
    <group ref={rootRef} name={`ArticulatedPlaceholder_${worker.id}`}>
      {/* Overhead 3D Selection / Status Diamond Crystal */}
      <mesh ref={beaconRef} position={[0, 1.44, 0]}>
        <octahedronGeometry args={[isSelected ? 0.12 : 0.08, 0]} />
        <meshBasicMaterial
          color={isPaused ? '#F59E0B' : accentColor}
          wireframe={!isSelected}
        />
      </mesh>

      {/* Pelvis / Hip Joint */}
      <mesh position={[0, 0.56, 0]} castShadow>
        <boxGeometry args={[0.3, 0.14, 0.2]} />
        <meshStandardMaterial color="#0F172A" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Left & Right Leg Groups */}
      <group ref={leftLegRef} position={[-0.09, 0.52, 0]}>
        <mesh position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
          <meshStandardMaterial color="#1E293B" roughness={0.65} metalness={0.2} />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.09, 0.52, 0]}>
        <mesh position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
          <meshStandardMaterial color="#1E293B" roughness={0.65} metalness={0.2} />
        </mesh>
      </group>

      {/* Upper Body & Torso Group */}
      <group ref={torsoRef} position={[0, 0.64, 0]}>
        {/* Sculpted Jacket Torso */}
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[0.34, 0.42, 0.22]} />
          <meshStandardMaterial color={suitColor} roughness={0.5} metalness={0.35} />
        </mesh>

        {/* Department Accent Collar & Chest Telemetry Core */}
        <mesh position={[0, 0.39, -0.02]}>
          <boxGeometry args={[0.26, 0.06, 0.22]} />
          <meshBasicMaterial color={accentColor} />
        </mesh>
        <mesh position={[0, 0.24, -0.115]}>
          <boxGeometry args={[0.14, 0.08, 0.015]} />
          <meshBasicMaterial color={isPaused ? '#F59E0B' : accentColor} />
        </mesh>

        {/* Neck */}
        <mesh position={[0, 0.46, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.09, 12]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.45} metalness={0.2} />
        </mesh>

        {/* Articulated Head & Visor Group */}
        <group ref={headRef} position={[0, 0.59, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.22, 0.24, 0.22]} />
            <meshStandardMaterial color="#E2E8F0" roughness={0.35} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.1, 0.01]}>
            <boxGeometry args={[0.23, 0.06, 0.23]} />
            <meshStandardMaterial color="#0F172A" roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.02, -0.115]}>
            <boxGeometry args={[0.19, 0.065, 0.02]} />
            <meshBasicMaterial color={isPaused ? '#F59E0B' : accentColor} />
          </mesh>
          <mesh position={[0.12, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
            <meshBasicMaterial color={accentColor} />
          </mesh>
        </group>

        {/* Left Articulated Arm */}
        <group ref={leftArmRef} position={[-0.22, 0.36, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <capsuleGeometry args={[0.042, 0.16, 6, 10]} />
            <meshStandardMaterial color={suitColor} roughness={0.5} metalness={0.3} />
          </mesh>
          <group ref={leftForearmRef} position={[0, -0.22, 0]}>
            <mesh position={[0, -0.09, -0.04]}>
              <capsuleGeometry args={[0.036, 0.14, 6, 10]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.4} metalness={0.2} />
            </mesh>
          </group>
        </group>

        {/* Right Articulated Arm */}
        <group ref={rightArmRef} position={[0.22, 0.36, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <capsuleGeometry args={[0.042, 0.16, 6, 10]} />
            <meshStandardMaterial color={suitColor} roughness={0.5} metalness={0.3} />
          </mesh>
          <group ref={rightForearmRef} position={[0, -0.22, 0]}>
            <mesh position={[0, -0.09, -0.04]}>
              <capsuleGeometry args={[0.036, 0.14, 6, 10]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.4} metalness={0.2} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export const WorkerAvatar = React.memo(function WorkerAvatar({
  worker,
  isSelected,
  reducedMotion,
  avatarLoadError,
  onSelectWorker,
  onModelError,
}: WorkerAvatarProps) {
  recordWorkerComponentRender(worker.id, 'avatar');

  const [px, py, pz] = worker.position3D;
  const resolution = resolveAvatarRenderMode(worker.id, worker.avatarConfig, {
    [worker.id]: avatarLoadError,
  });

  // If URL format itself is invalid (e.g., not .glb/.gltf), report error once without crashing
  useEffect(() => {
    if (
      worker.avatarConfig.modelUrl &&
      resolution.mode === 'fallback-after-error' &&
      !avatarLoadError &&
      resolution.errorDetail &&
      onModelError
    ) {
      onModelError(
        worker.id,
        worker.avatarConfig.modelUrl,
        resolution.errorDetail,
      );
    }
  }, [
    worker.id,
    worker.avatarConfig.modelUrl,
    resolution.mode,
    resolution.errorDetail,
    avatarLoadError,
    onModelError,
  ]);

  const placeholderElement = (
    <ArticulatedHumanoidPlaceholder
      worker={worker}
      isSelected={isSelected}
      reducedMotion={reducedMotion}
    />
  );

  return (
    <group
      position={[px, py, pz]}
      rotation={[0, worker.deskRotationY, 0]}
      name={`WorkerAvatar_${worker.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectWorker(worker.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
      }}
    >
      {resolution.mode === 'glb' && resolution.activeModelUrl ? (
        <AvatarModelErrorBoundary
          workerId={worker.id}
          workerName={worker.name}
          modelUrl={resolution.activeModelUrl}
          fallback={placeholderElement}
          onModelError={onModelError}
        >
          <Suspense fallback={placeholderElement}>
            <RiggedGlbAvatar
              modelUrl={resolution.activeModelUrl}
              worker={worker}
              reducedMotion={reducedMotion}
            />
          </Suspense>
        </AvatarModelErrorBoundary>
      ) : (
        placeholderElement
      )}
    </group>
  );
});

/**
 * Granular Zustand-connected wrapper for a single WorkerAvatar.
 * Subscribes ONLY to this worker's slice so updating one worker never re-renders
 * any other worker's avatar component.
 */
export const WorkerAvatarSceneItem = React.memo(function WorkerAvatarSceneItem({
  workerId,
}: {
  workerId: WorkerId;
}) {
  const worker = useOfficeStore((s) => s.workers[workerId]);
  const isSelected = useOfficeStore((s) => s.selectedWorkerId === workerId);
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);
  const avatarLoadError = useOfficeStore((s) => s.avatarLoadErrors[workerId]);
  const selectWorker = useOfficeStore((s) => s.selectWorker);
  const recordAvatarModelError = useOfficeStore(
    (s) => s.recordAvatarModelError,
  );

  if (!worker) return null;

  return (
    <WorkerAvatar
      worker={worker}
      isSelected={isSelected}
      reducedMotion={reducedMotion}
      avatarLoadError={avatarLoadError}
      onSelectWorker={selectWorker}
      onModelError={recordAvatarModelError}
    />
  );
});
