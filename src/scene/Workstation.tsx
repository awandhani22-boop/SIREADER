import { useFrame } from '@react-three/fiber';
import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { useOfficeStore } from '../workers/worker.state';
import { useWorkerDisplayModeStore } from '../workers/worker.display-mode';
import { createDemoWorkerRepository, createLiveWorkerRepository } from '../workers/worker.live-repository';
import { useLiveStore } from '../live/live.state';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';
import {
  WorkerId,
  WorkerStatus,
  WorkstationDefinition,
} from '../workers/worker.types';
import {
  AvatarSimClockState,
  createAvatarSimClockState,
  stepAvatarClockFromEngine,
} from './avatarAnimation';
import { SCENE_COLORS } from './scene.constants';

/**
 * Workstation Component (Composite 3D Desk + Chair + Multi-Monitor Rig)
 * - Selection ring rotation is driven by the unified `SimulationEngine` clock
 *   (`stepAvatarClockFromEngine`), freezing on Global Pause, Worker Pause, or Reduced Motion.
 * - Memoized with granular per-workstation selector (`WorkstationSceneItem`).
 */

interface WorkstationProps {
  workstation: WorkstationDefinition;
  workerStatus: WorkerStatus;
  isSelected: boolean;
  reducedMotion: boolean;
  onSelectWorker: (workerId: WorkerId) => void;
}

export const Workstation = React.memo(function Workstation({
  workstation,
  workerStatus,
  isSelected,
  reducedMotion,
  onSelectWorker,
}: WorkstationProps) {
  const [hovered, setHovered] = useState(false);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const clockStateRef = useRef<AvatarSimClockState>(
    createAvatarSimClockState(workstation.workerId, useOfficeStore.getState()),
  );
  const [dx, dy, dz] = workstation.deskPosition3D;
  const [sx, sy, sz] = workstation.seatPosition3D;

  const isWorking =
    workerStatus === 'BUSY' ||
    workerStatus === 'TASK_RECEIVED' ||
    workerStatus === 'COMPLETED';

  // Animate selection ring rotation using unified SimulationEngine time
  useFrame(() => {
    const storeState = useOfficeStore.getState();
    const { animTimeSec } = stepAvatarClockFromEngine(
      clockStateRef.current,
      storeState,
      workstation.workerId,
      reducedMotion,
      performance.now(),
    );
    if (!selectionRingRef.current || !(isSelected || hovered)) return;
    selectionRingRef.current.rotation.z = animTimeSec * 0.85;
  });

  const monitorOffsets =
    workstation.monitorCount === 3
      ? [
          { x: -0.68, z: 0.08, rotY: 0.28 },
          { x: 0, z: 0, rotY: 0 },
          { x: 0.68, z: 0.08, rotY: -0.28 },
        ]
      : [
          { x: -0.36, z: 0.04, rotY: 0.15 },
          { x: 0.36, z: 0.04, rotY: -0.15 },
        ];

  return (
    <group name={`Workstation_${workstation.id}`}>
      {/* Interactive Desk Assembly */}
      <group
        position={[dx, dy, dz]}
        rotation={[0, workstation.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectWorker(workstation.workerId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* Main Desk Tabletop */}
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.07, 0.95]} />
          <meshStandardMaterial
            color={hovered || isSelected ? '#26354D' : SCENE_COLORS.deskSurface}
            roughness={0.35}
            metalness={0.55}
          />
        </mesh>

        {/* Glowing Front Accent Trim on Desk */}
        <mesh position={[0, 0.74, -0.48]}>
          <boxGeometry args={[2.12, 0.03, 0.025]} />
          <meshBasicMaterial
            color={workstation.accentColor}
            transparent
            opacity={isSelected || isWorking ? 0.95 : 0.45}
          />
        </mesh>

        {/* Left & Right Metallic Desk Legs */}
        <mesh position={[-0.92, 0.37, 0]}>
          <boxGeometry args={[0.1, 0.74, 0.82]} />
          <meshStandardMaterial
            color={SCENE_COLORS.deskFrame}
            roughness={0.5}
            metalness={0.7}
          />
        </mesh>
        <mesh position={[0.92, 0.37, 0]}>
          <boxGeometry args={[0.1, 0.74, 0.82]} />
          <meshStandardMaterial
            color={SCENE_COLORS.deskFrame}
            roughness={0.5}
            metalness={0.7}
          />
        </mesh>

        {/* Front Modesty Panel */}
        <mesh position={[0, 0.44, -0.38]}>
          <boxGeometry args={[1.8, 0.48, 0.04]} />
          <meshStandardMaterial color="#0F172A" roughness={0.6} metalness={0.4} />
        </mesh>

        {/* Illuminated Tactile Keyboard Deck */}
        <mesh position={[0, 0.785, 0.22]}>
          <boxGeometry args={[0.52, 0.02, 0.2]} />
          <meshStandardMaterial color="#090D16" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.798, 0.22]}>
          <boxGeometry args={[0.46, 0.005, 0.14]} />
          <meshBasicMaterial
            color={workstation.accentColor}
            transparent
            opacity={isWorking ? 0.85 : 0.3}
          />
        </mesh>

        {/* Multi-Monitor Array */}
        {monitorOffsets.map((mon, idx) => (
          <group
            key={`${workstation.id}-mon-${idx}`}
            position={[mon.x, 1.06, -0.18 + mon.z]}
            rotation={[0, mon.rotY, 0]}
          >
            <mesh position={[0, -0.16, -0.05]}>
              <cylinderGeometry args={[0.025, 0.035, 0.28, 10]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.62, 0.38, 0.035]} />
              <meshStandardMaterial
                color={SCENE_COLORS.monitorBezel}
                roughness={0.3}
                metalness={0.7}
              />
            </mesh>
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[0.57, 0.33, 0.005]} />
              <meshBasicMaterial
                color={
                  workerStatus === 'PAUSED'
                    ? '#F59E0B'
                    : isWorking
                      ? workstation.accentColor
                      : '#1E293B'
                }
                transparent
                opacity={isWorking ? 0.85 : 0.45}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Ergonomic Sci-Fi Office Chair + Ground Selection Ring */}
      <group
        position={[sx, sy, sz]}
        rotation={[0, workstation.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectWorker(workstation.workerId);
        }}
      >
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.85, 24]} />
          <meshBasicMaterial
            color="#020617"
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>

        {(isSelected || hovered) && (
          <mesh
            ref={selectionRingRef}
            position={[0, 0.045, -0.35]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[1.18, 1.32, 32]} />
            <meshBasicMaterial
              color={isSelected ? workstation.accentColor : '#38BDF8'}
              transparent
              opacity={isSelected ? 0.95 : 0.55}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}

        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 0.05, 16]} />
          <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.36, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[0.52, 0.07, 0.5]} />
          <meshStandardMaterial
            color={SCENE_COLORS.chairFabric}
            roughness={0.75}
            metalness={0.15}
          />
        </mesh>
        <mesh position={[0, 0.82, 0.23]}>
          <boxGeometry args={[0.48, 0.72, 0.07]} />
          <meshStandardMaterial
            color={SCENE_COLORS.chairFabric}
            roughness={0.7}
            metalness={0.2}
          />
        </mesh>
        <mesh position={[0, 0.82, 0.27]}>
          <boxGeometry args={[0.12, 0.56, 0.02]} />
          <meshBasicMaterial color={workstation.accentColor} />
        </mesh>
      </group>
    </group>
  );
});

export const WorkstationSceneItem = React.memo(function WorkstationSceneItem({
  workstation,
}: {
  workstation: WorkstationDefinition;
}) {
  const displayMode = useWorkerDisplayModeStore((s) => s.mode);
  const selectedLiveWorkerId = useWorkerDisplayModeStore((s) => s.selectedLiveWorkerId);
  const setSelectedLiveWorkerId = useWorkerDisplayModeStore((s) => s.setSelectedLiveWorkerId);
  const liveResource = useLiveStore((s) => s.resources['/api/v1/workforce/runtime']);
  const liveSession = useLiveStore((s) => s.session);
  const liveConnection = useLiveStore((s) => s.connection);
  const liveSnapshot = liveResource.data as WorkforceRuntimeResponseDto | null;
  const worker = useOfficeStore((s) => s.workers[workstation.workerId]);
  const demoRepository = createDemoWorkerRepository(worker ? [worker] : []);
  const liveRepository = createLiveWorkerRepository(liveSnapshot, liveResource.status, liveSession, liveConnection);
  const view = displayMode === 'LIVE'
    ? liveRepository.getWorker(workstation.workerId)
    : demoRepository.getWorker(workstation.workerId);
  const selectedDemoWorkerId = useOfficeStore((s) => s.selectedWorkerId);
  const selectDemoWorker = useOfficeStore((s) => s.selectWorker);
  const isSelected = displayMode === 'LIVE'
    ? selectedLiveWorkerId === workstation.workerId
    : selectedDemoWorkerId === workstation.workerId;
  const reducedMotion = useOfficeStore((s) => s.reducedMotion);

  return (
    <Workstation
      workstation={workstation}
      workerStatus={view.visualStatus}
      isSelected={isSelected}
      reducedMotion={displayMode === 'LIVE' || reducedMotion}
      onSelectWorker={(workerId) => {
        if (displayMode === 'LIVE') setSelectedLiveWorkerId(workerId);
        else selectDemoWorker(workerId);
      }}
    />
  );
});
