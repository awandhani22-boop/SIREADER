import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  TaskEntity,
  WorkerEntity,
  WorkerId,
} from '../workers/worker.types';

/**
 * WorkerAvatar Component (Skill 04 — Human Character & Animation System)
 *
 * Supports:
 * 1. Rigged GLB/glTF characters with animation clip mapping (`idle`, `seated`,
 *    `typing`, `walking`, `talking`) when `worker.avatarConfig.modelUrl` is provided.
 * 2. Honest 12-part Articulated Humanoid Placeholder when `modelUrl` is null,
 *    with smooth per-frame joint kinematics driven strictly via `useRef` inside
 *    `useFrame` (zero 60Hz React state updates).
 */

interface WorkerAvatarProps {
  worker: WorkerEntity;
  activeTask: TaskEntity | null;
  isSelected: boolean;
  reducedMotion: boolean;
  onSelectWorker: (workerId: WorkerId) => void;
}

interface RiggedGlbModelProps {
  modelUrl: string;
  worker: WorkerEntity;
  reducedMotion: boolean;
}

function RiggedGlbAvatar({ modelUrl, worker, reducedMotion }: RiggedGlbModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelUrl);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    const requestedClipName = worker.avatarConfig.animationMap[worker.animationState];
    const clipAction =
      (requestedClipName && actions[requestedClipName]) ||
      Object.values(actions)[0] ||
      null;

    if (clipAction) {
      clipAction.reset().fadeIn(0.25).play();
      clipAction.paused = worker.status === 'PAUSED' || reducedMotion;
    }

    return () => {
      if (clipAction) {
        clipAction.fadeOut(0.2);
      }
    };
  }, [actions, worker.animationState, worker.avatarConfig.animationMap, worker.status, reducedMotion]);

  return (
    <group ref={groupRef}>
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

  const phaseOffset = useRef(
    worker.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) * 0.37,
  );

  useFrame((state) => {
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

    const isPaused = worker.status === 'PAUSED' || reducedMotion;
    const t = isPaused ? phaseOffset.current : state.clock.elapsedTime + phaseOffset.current;
    const anim = worker.animationState;

    if (beaconRef.current && !isPaused) {
      beaconRef.current.rotation.y = t * 1.8;
    }

    if (anim === 'walking') {
      // Standing upright walk cycle along corridor waypoint -> workstation
      rootRef.current.position.y = 0.04 + Math.abs(Math.sin(t * 7)) * 0.035;
      torsoRef.current.rotation.x = 0.08;
      headRef.current.rotation.y = Math.sin(t * 2.5) * 0.12;
      headRef.current.rotation.x = 0;

      leftArmRef.current.rotation.x = Math.sin(t * 7) * 0.45;
      rightArmRef.current.rotation.x = -Math.sin(t * 7) * 0.45;
      leftForearmRef.current.rotation.x = -0.35;
      rightForearmRef.current.rotation.x = -0.35;

      leftLegRef.current.rotation.x = -Math.sin(t * 7) * 0.5;
      rightLegRef.current.rotation.x = Math.sin(t * 7) * 0.5;
    } else if (anim === 'typing') {
      // Seated focused keyboard typing posture
      rootRef.current.position.y = -0.14;
      torsoRef.current.rotation.x = -0.12 + Math.sin(t * 2.2) * 0.02;
      headRef.current.rotation.x = 0.1 + Math.sin(t * 3.1) * 0.03;
      headRef.current.rotation.y = Math.sin(t * 1.4) * 0.14;

      leftArmRef.current.rotation.x = -0.68 + Math.sin(t * 14) * 0.07;
      rightArmRef.current.rotation.x = -0.68 + Math.cos(t * 14) * 0.07;
      leftForearmRef.current.rotation.x = -0.62 + Math.sin(t * 18) * 0.09;
      rightForearmRef.current.rotation.x = -0.62 + Math.cos(t * 18) * 0.09;

      leftLegRef.current.rotation.x = -1.35;
      rightLegRef.current.rotation.x = -1.35;
    } else if (anim === 'talking') {
      // Seated analytical briefing / coordination gesture
      rootRef.current.position.y = -0.14;
      torsoRef.current.rotation.x = -0.05;
      headRef.current.rotation.x = Math.sin(t * 4.5) * 0.07;
      headRef.current.rotation.y = Math.sin(t * 2.2) * 0.22;

      leftArmRef.current.rotation.x = -0.55 + Math.sin(t * 5.2) * 0.18;
      rightArmRef.current.rotation.x = -0.55 + Math.cos(t * 4.8) * 0.18;
      leftForearmRef.current.rotation.x = -0.5 + Math.sin(t * 5.2) * 0.15;
      rightForearmRef.current.rotation.x = -0.5 + Math.cos(t * 4.8) * 0.15;

      leftLegRef.current.rotation.x = -1.35;
      rightLegRef.current.rotation.x = -1.35;
    } else {
      // Seated idle / paused calm breathing
      rootRef.current.position.y = -0.14;
      torsoRef.current.rotation.x = Math.sin(t * 1.6) * 0.025;
      headRef.current.rotation.x = 0.04;
      headRef.current.rotation.y = isPaused ? 0 : Math.sin(t * 0.9) * 0.1;

      leftArmRef.current.rotation.x = -0.35;
      rightArmRef.current.rotation.x = -0.35;
      leftForearmRef.current.rotation.x = -0.45;
      rightForearmRef.current.rotation.x = -0.45;

      leftLegRef.current.rotation.x = -1.35;
      rightLegRef.current.rotation.x = -1.35;
    }
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
          {/* Cranial Shell */}
          <mesh castShadow>
            <boxGeometry args={[0.22, 0.24, 0.22]} />
            <meshStandardMaterial color="#E2E8F0" roughness={0.35} metalness={0.25} />
          </mesh>
          {/* Futuristic Hair / Crown Cap */}
          <mesh position={[0, 0.1, 0.01]}>
            <boxGeometry args={[0.23, 0.06, 0.23]} />
            <meshStandardMaterial color="#0F172A" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Glowing Sci-Fi Optical Visor (Facing -Z toward desk monitors) */}
          <mesh position={[0, 0.02, -0.115]}>
            <boxGeometry args={[0.19, 0.065, 0.02]} />
            <meshBasicMaterial color={isPaused ? '#F59E0B' : accentColor} />
          </mesh>
          {/* Side Comms Ear-Piece */}
          <mesh position={[0.12, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
            <meshBasicMaterial color={accentColor} />
          </mesh>
        </group>

        {/* Left Articulated Arm (Shoulder + Upper Arm + Hinged Forearm/Hand) */}
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

        {/* Right Articulated Arm (Shoulder + Upper Arm + Hinged Forearm/Hand) */}
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

export function WorkerAvatar({
  worker,
  isSelected,
  reducedMotion,
  onSelectWorker,
}: WorkerAvatarProps) {
  const [px, py, pz] = worker.position3D;

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
      {/* Render Rigged GLB Model if configured, otherwise Honest Articulated Placeholder */}
      {worker.avatarConfig.modelUrl ? (
        <Suspense
          fallback={
            <ArticulatedHumanoidPlaceholder
              worker={worker}
              isSelected={isSelected}
              reducedMotion={reducedMotion}
            />
          }
        >
          <RiggedGlbAvatar
            modelUrl={worker.avatarConfig.modelUrl}
            worker={worker}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      ) : (
        <ArticulatedHumanoidPlaceholder
          worker={worker}
          isSelected={isSelected}
          reducedMotion={reducedMotion}
        />
      )}
    </group>
  );
}
