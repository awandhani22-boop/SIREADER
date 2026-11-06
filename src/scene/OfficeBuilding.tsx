import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OFFICE_DIMENSIONS, SCENE_COLORS } from './scene.constants';

/**
 * OfficeBuilding (Static Architectural Environment)
 * Renders the foundation slab, central East–West spine corridor, illuminated
 * routing pathways, perimeter framing, and instanced structural pillars.
 * Separated from dynamic worker meshes for optimal 7–100 worker scalability.
 */

interface OfficeBuildingProps {
  onBackgroundClick: () => void;
}

const PILLAR_COORDINATES: [number, number, number][] = [
  [-12.0, 1.35, -2.5],
  [-4.4, 1.35, -2.5],
  [4.4, 1.35, -2.5],
  [12.0, 1.35, -2.5],
  [-12.0, 1.35, 2.5],
  [-4.4, 1.35, 2.5],
  [4.4, 1.35, 2.5],
  [12.0, 1.35, 2.5],
  [-18.8, 1.35, -4.6],
  [-18.8, 1.35, 4.6],
  [12.0, 1.35, -10.1],
  [-12.0, 1.35, -10.1],
  [12.0, 1.35, 10.1],
  [-12.0, 1.35, 10.1],
];

const CORRIDOR_NODE_X = [-11.5, -8.2, -4.1, 0, 4.1, 8.2, 11.2];

export function OfficeBuilding({ onBackgroundClick }: OfficeBuildingProps) {
  const pillarInstancedRef = useRef<THREE.InstancedMesh>(null);
  const nodeInstancedRef = useRef<THREE.InstancedMesh>(null);

  const pillarGeom = useMemo(() => new THREE.BoxGeometry(0.28, 2.7, 0.28), []);
  const pillarMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1E293B',
        roughness: 0.45,
        metalness: 0.5,
      }),
    [],
  );

  const nodeGeom = useMemo(() => new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), []);
  const nodeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#06B6D4',
      }),
    [],
  );

  useLayoutEffect(() => {
    if (pillarInstancedRef.current) {
      const dummy = new THREE.Object3D();
      PILLAR_COORDINATES.forEach((pos, idx) => {
        dummy.position.set(pos[0], pos[1], pos[2]);
        dummy.updateMatrix();
        pillarInstancedRef.current!.setMatrixAt(idx, dummy.matrix);
      });
      pillarInstancedRef.current.instanceMatrix.needsUpdate = true;
      pillarInstancedRef.current.computeBoundingSphere();
    }

    if (nodeInstancedRef.current) {
      const dummy = new THREE.Object3D();
      CORRIDOR_NODE_X.forEach((x, idx) => {
        dummy.position.set(x, 0.025, 0);
        dummy.updateMatrix();
        nodeInstancedRef.current!.setMatrixAt(idx, dummy.matrix);
      });
      nodeInstancedRef.current.instanceMatrix.needsUpdate = true;
      nodeInstancedRef.current.computeBoundingSphere();
    }
  }, []);

  return (
    <group name="OfficeBuildingStatic">
      {/* Main Architectural Foundation Slab */}
      <mesh
        position={[-1.5, -0.18, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onBackgroundClick();
        }}
      >
        <boxGeometry
          args={[OFFICE_DIMENSIONS.totalWidthX, 0.36, OFFICE_DIMENSIONS.totalDepthZ]}
        />
        <meshStandardMaterial
          color={SCENE_COLORS.baseSlab}
          roughness={0.85}
          metalness={0.15}
        />
      </mesh>

      {/* Outer Metallic Perimeter Trim */}
      <mesh position={[-1.5, -0.02, 0]}>
        <boxGeometry
          args={[
            OFFICE_DIMENSIONS.totalWidthX + 0.3,
            0.06,
            OFFICE_DIMENSIONS.totalDepthZ + 0.3,
          ]}
        />
        <meshStandardMaterial
          color={SCENE_COLORS.baseSlabBorder}
          roughness={0.5}
          metalness={0.6}
        />
      </mesh>

      {/* Central Spine Corridor Floor (Connects Reception + 6 North/South Rooms) */}
      <mesh
        position={[-0.2, 0.01, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onBackgroundClick();
        }}
      >
        <boxGeometry args={[24.8, 0.02, OFFICE_DIMENSIONS.corridorWidthZ]} />
        <meshStandardMaterial
          color={SCENE_COLORS.corridorFloor}
          roughness={0.65}
          metalness={0.25}
        />
      </mesh>

      {/* Illuminated Sci-Fi Corridor Data Spine Strips */}
      <mesh position={[-0.2, 0.022, -1.85]}>
        <boxGeometry args={[24.2, 0.01, 0.07]} />
        <meshBasicMaterial color="#06B6D4" transparent opacity={0.55} />
      </mesh>
      <mesh position={[-0.2, 0.022, 1.85]}>
        <boxGeometry args={[24.2, 0.01, 0.07]} />
        <meshBasicMaterial color="#06B6D4" transparent opacity={0.55} />
      </mesh>
      <mesh position={[-0.2, 0.022, 0]}>
        <boxGeometry args={[23.6, 0.01, 0.05]} />
        <meshBasicMaterial color="#3B82F6" transparent opacity={0.4} />
      </mesh>

      {/* Branching doorway light strips connecting Spine to the 6 North/South rooms */}
      {[-8.2, 0, 8.2].map((roomX) => (
        <group key={`corridor-branch-${roomX}`}>
          {/* North branch */}
          <mesh position={[roomX, 0.022, -1.6]}>
            <boxGeometry args={[0.08, 0.01, 3.2]} />
            <meshBasicMaterial color="#38BDF8" transparent opacity={0.5} />
          </mesh>
          {/* South branch */}
          <mesh position={[roomX, 0.022, 1.6]}>
            <boxGeometry args={[0.08, 0.01, 3.2]} />
            <meshBasicMaterial color="#38BDF8" transparent opacity={0.5} />
          </mesh>
        </group>
      ))}

      {/* Instanced Structural Columns (Scalable Single Draw Call) */}
      <instancedMesh
        ref={pillarInstancedRef}
        args={[pillarGeom, pillarMat, PILLAR_COORDINATES.length]}
      />

      {/* Instanced Corridor Navigation Waypoint Discs */}
      <instancedMesh
        ref={nodeInstancedRef}
        args={[nodeGeom, nodeMat, CORRIDOR_NODE_X.length]}
      />
    </group>
  );
}
