import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import {
  WorkerId,
  WorkerStatus,
  WorkstationDefinition,
} from '../workers/worker.types';
import { SCENE_COLORS } from './scene.constants';

/**
 * Workstation Component (Composite 3D Desk + Chair + Multi-Monitor Rig)
 * Clickable target in the 3D scene (`e.stopPropagation()`) that selects
 * the assigned worker and highlights when active or selected.
 */

interface WorkstationProps {
  workstation: WorkstationDefinition;
  workerStatus: WorkerStatus;
  isSelected: boolean;
  reducedMotion: boolean;
  onSelectWorker: (workerId: WorkerId) => void;
}

export function Workstation({
  workstation,
  workerStatus,
  isSelected,
  reducedMotion,
  onSelectWorker,
}: WorkstationProps) {
  const [hovered, setHovered] = useState(false);
  const selectionRingRef = useRef<THREE.Mesh>(null);
  const [dx, dy, dz] = workstation.deskPosition3D;
  const [sx, sy, sz] = workstation.seatPosition3D;

  const isWorking =
    workerStatus === 'BUSY' ||
    workerStatus === 'TASK_RECEIVED' ||
    workerStatus === 'COMPLETED';

  // Animate selection ring rotation smoothly via ref without React state updates
  useFrame((_, delta) => {
    if (selectionRingRef.current && (isSelected || hovered) && !reducedMotion) {
      selectionRingRef.current.rotation.z += delta * 0.85;
    }
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
            {/* Monitor Stand Stem */}
            <mesh position={[0, -0.16, -0.05]}>
              <cylinderGeometry args={[0.025, 0.035, 0.28, 10]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
            </mesh>
            {/* Monitor Outer Bezel */}
            <mesh>
              <boxGeometry args={[0.62, 0.38, 0.035]} />
              <meshStandardMaterial
                color={SCENE_COLORS.monitorBezel}
                roughness={0.3}
                metalness={0.7}
              />
            </mesh>
            {/* Monitor Active Display Screen (Faces the worker seated at +Z) */}
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
        {/* Soft Radial Contact Shadow Disc (`y = 0.035` to avoid Z-fighting) */}
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.85, 24]} />
          <meshBasicMaterial
            color="#020617"
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>

        {/* Interactive Selection Ring */}
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

        {/* Chair Pedestal Base */}
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 0.05, 16]} />
          <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Hydraulic Stem */}
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.36, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Seat Cushion */}
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[0.52, 0.07, 0.5]} />
          <meshStandardMaterial
            color={SCENE_COLORS.chairFabric}
            roughness={0.75}
            metalness={0.15}
          />
        </mesh>
        {/* High-Back Support Rest (Behind seated avatar at +Z) */}
        <mesh position={[0, 0.82, 0.23]}>
          <boxGeometry args={[0.48, 0.72, 0.07]} />
          <meshStandardMaterial
            color={SCENE_COLORS.chairFabric}
            roughness={0.7}
            metalness={0.2}
          />
        </mesh>
        {/* Chair Accent Spine Strip */}
        <mesh position={[0, 0.82, 0.27]}>
          <boxGeometry args={[0.12, 0.56, 0.02]} />
          <meshBasicMaterial color={workstation.accentColor} />
        </mesh>
      </group>
    </group>
  );
}
