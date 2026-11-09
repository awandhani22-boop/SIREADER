import { MapControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ROOM_LIST,
  WORKSTATION_REGISTRY,
} from '../workers/worker.registry';
import { useOfficeStore } from '../workers/worker.state';
import { RoomDefinition } from '../workers/worker.types';
import { useWorkerDisplayModeStore } from '../workers/worker.display-mode';
import { createDemoWorkerRepository, createLiveWorkerRepository } from '../workers/worker.live-repository';
import { useLiveStore } from '../live/live.state';
import type { WorkforceRuntimeResponseDto } from '../live/live.contracts';
import { OfficeBuilding } from './OfficeBuilding';
import { Room } from './Room';
import {
  ISOMETRIC_CAMERA_DEFAULTS,
  IS_SOFTWARE_GL,
  SCENE_COLORS,
} from './scene.constants';
import { WorkerAvatarSceneItem } from './WorkerAvatar';
import { WorkstationSceneItem } from './Workstation';
import {
  roomLabelDomRefs,
  workerLabelDomRefs,
  WorldLabelsOverlay,
} from './WorldLabelsOverlay';

const _projVec = new THREE.Vector3();
const WORKSTATION_LIST = Object.values(WORKSTATION_REGISTRY);

/**
 * SpatialLabelProjector
 * Projects 3D world positions of rooms and workers to 2D viewport pixel coordinates
 * inside `useFrame` using a single scratch Vector3 (`_projVec`) and writes directly
 * to DOM node `style.transform` refs (zero React state updates, zero GC allocation).
 */
function SpatialLabelProjector() {
  const { camera, size } = useThree();

  useFrame(() => {
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const state = useOfficeStore.getState();

    // Project 7 room signage positions cleanly above room back walls
    for (const room of ROOM_LIST) {
      const domEl = roomLabelDomRefs[room.id];
      if (!domEl) continue;

      const [cx, , cz] = room.center3D;
      const [, , depthZ] = room.size3D;
      const zOffset =
        room.doorSide === 'south'
          ? -depthZ / 2 - 0.3
          : room.doorSide === 'north'
            ? -depthZ / 2 + 0.1
            : -depthZ / 2 + 0.2;

      _projVec.set(cx, 2.95, cz + zOffset);
      _projVec.project(camera);

      const x = _projVec.x * halfW + halfW;
      const y = -(_projVec.y * halfH) + halfH;
      domEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    // Project 7 worker avatar badge positions at torso/desk level
    for (const workerId of state.workerOrder) {
      const worker = state.workers[workerId];
      const domEl = workerLabelDomRefs[workerId];
      if (!worker || !domEl) continue;

      const [wx, wy, wz] = worker.position3D;
      _projVec.set(wx, wy + 1.25, wz + 0.35);
      _projVec.project(camera);

      const x = _projVec.x * halfW + halfW;
      const y = -(_projVec.y * halfH) + halfH;
      domEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  });

  return null;
}

function IsometricCameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const cameraResetTrigger = useOfficeStore((s) => s.cameraResetTrigger);
  const cameraZoomDeltaTrigger = useOfficeStore((s) => s.cameraZoomDeltaTrigger);

  useEffect(() => {
    if (cameraResetTrigger === 0) return;
    const orthoCam = camera as THREE.OrthographicCamera;
    orthoCam.position.set(...ISOMETRIC_CAMERA_DEFAULTS.position);
    orthoCam.zoom = ISOMETRIC_CAMERA_DEFAULTS.defaultZoom;
    orthoCam.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(...ISOMETRIC_CAMERA_DEFAULTS.target);
      controlsRef.current.update();
    }
    invalidate();
  }, [cameraResetTrigger, camera, invalidate]);

  useEffect(() => {
    if (cameraZoomDeltaTrigger.nonce === 0) return;
    const orthoCam = camera as THREE.OrthographicCamera;
    const nextZoom = THREE.MathUtils.clamp(
      orthoCam.zoom + cameraZoomDeltaTrigger.step,
      ISOMETRIC_CAMERA_DEFAULTS.minZoom,
      ISOMETRIC_CAMERA_DEFAULTS.maxZoom,
    );
    orthoCam.zoom = nextZoom;
    orthoCam.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.update();
    }
    invalidate();
  }, [cameraZoomDeltaTrigger, camera, invalidate]);

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={ISOMETRIC_CAMERA_DEFAULTS.position}
        zoom={ISOMETRIC_CAMERA_DEFAULTS.defaultZoom}
        near={ISOMETRIC_CAMERA_DEFAULTS.near}
        far={ISOMETRIC_CAMERA_DEFAULTS.far}
      />
      <MapControls
        ref={controlsRef}
        target={ISOMETRIC_CAMERA_DEFAULTS.target}
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        enableDamping={!IS_SOFTWARE_GL}
        dampingFactor={0.08}
        minZoom={ISOMETRIC_CAMERA_DEFAULTS.minZoom}
        maxZoom={ISOMETRIC_CAMERA_DEFAULTS.maxZoom}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
      />
    </>
  );
}

/**
 * Granular memoized Room wrapper subscribing only to its primary worker's status
 * and selection state.
 */
const RoomSceneItem = React.memo(function RoomSceneItem({
  room,
}: {
  room: RoomDefinition;
}) {
  const worker = useOfficeStore((state) => state.workers[room.primaryWorkerId]);
  const displayMode = useWorkerDisplayModeStore((state) => state.mode);
  const liveResource = useLiveStore((state) => state.resources['/api/v1/workforce/runtime']);
  const liveSession = useLiveStore((state) => state.session);
  const liveConnection = useLiveStore((state) => state.connection);
  const liveSnapshot = liveResource.data as WorkforceRuntimeResponseDto | null;
  const liveRepository = createLiveWorkerRepository(liveSnapshot, liveResource.status, liveSession, liveConnection);
  const demoRepository = createDemoWorkerRepository(worker ? [worker] : []);
  const workerStatus = displayMode === 'LIVE'
    ? liveRepository.getWorker(room.primaryWorkerId).visualStatus
    : demoRepository.getWorker(room.primaryWorkerId).visualStatus;
  const isSelected = useOfficeStore(
    (s) =>
      s.selectedRoomId === room.id || s.selectedWorkerId === room.primaryWorkerId,
  );
  const selectRoom = useOfficeStore((s) => s.selectRoom);

  return (
    <Room
      room={room}
      isSelected={isSelected}
      workerStatus={workerStatus}
      onSelectRoom={selectRoom}
    />
  );
});

/**
 * OfficeSceneContent (Fix C — Granular Subscriptions)
 * Does NOT subscribe to the entire `workers` or `tasks` map; only subscribes to
 * `workerOrder` and `graphicsPreset` so individual worker updates only re-render
 * the specific affected worker item.
 */
function OfficeSceneContent() {
  const workerOrder = useOfficeStore((s) => s.workerOrder);
  const graphicsPreset = useOfficeStore((s) => s.graphicsPreset);
  const selectWorker = useOfficeStore((s) => s.selectWorker);

  const enableShadows = !IS_SOFTWARE_GL && graphicsPreset === 'high';

  return (
    <>
      <color attach="background" args={[SCENE_COLORS.voidBackground]} />
      <fog attach="fog" args={[SCENE_COLORS.fogColor, 55, 110]} />

      <IsometricCameraRig />
      <SpatialLabelProjector />

      {/* Balanced Corporate Sci-Fi Studio Lighting Rig */}
      <hemisphereLight args={['#7DD3FC', '#1E293B', 1.25]} />
      <directionalLight
        position={[20, 30, 18]}
        intensity={1.95}
        color="#F8FAFC"
        castShadow={enableShadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-22, 18, -16]} intensity={0.85} color="#818CF8" />
      <pointLight position={[-15.5, 3.8, 0]} intensity={1.6} distance={14} color="#06B6D4" />
      <pointLight position={[0, 3.8, 0]} intensity={1.3} distance={18} color="#38BDF8" />
      <pointLight position={[8.2, 3.8, 0]} intensity={1.2} distance={16} color="#8B5CF6" />

      {/* 1. Static Office Building & Spine Corridor */}
      <OfficeBuilding onBackgroundClick={() => selectWorker(null)} />

      {/* 2. Seven Department Rooms (Granular Memoized Items) */}
      <group name="DepartmentRoomsGroup">
        {ROOM_LIST.map((room) => (
          <RoomSceneItem key={room.id} room={room} />
        ))}
      </group>

      {/* 3. Interactive Workstations (Granular Memoized Items) */}
      <group name="WorkstationsGroup">
        {WORKSTATION_LIST.map((ws) => (
          <WorkstationSceneItem key={ws.id} workstation={ws} />
        ))}
      </group>

      {/* 4. Dynamic Worker Avatars (Granular Memoized Items) */}
      <group name="WorkerAvatarsGroup">
        {workerOrder.map((workerId) => (
          <WorkerAvatarSceneItem key={workerId} workerId={workerId} />
        ))}
      </group>
    </>
  );
}

export function OfficeScene() {
  const graphicsPreset = useOfficeStore((s) => s.graphicsPreset);
  const dpr: [number, number] =
    IS_SOFTWARE_GL || graphicsPreset === 'balanced' ? [1, 1] : [1, 2];

  return (
    <div
      className="relative w-full h-full bg-[#070C18] select-none"
      data-testid="office-3d-viewport"
    >
      <Canvas
        shadows={!IS_SOFTWARE_GL && graphicsPreset === 'high'}
        dpr={dpr}
        gl={{
          antialias: !IS_SOFTWARE_GL,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
      >
        <OfficeSceneContent />
      </Canvas>
      <WorldLabelsOverlay />
    </div>
  );
}
