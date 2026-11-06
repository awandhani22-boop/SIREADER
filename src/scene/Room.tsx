import { RoomDefinition, WorkerId, WorkerStatus } from '../workers/worker.types';
import { SCENE_COLORS } from './scene.constants';

/**
 * Room Component (7 Initial SIREADER Departments)
 * Renders room floor pad, low-cut isometric walls, corridor glass partitions with
 * framed doorways, and department-specific interior props.
 */

interface RoomProps {
  room: RoomDefinition;
  isSelected: boolean;
  workerStatus: WorkerStatus;
  onSelectRoom: (roomId: RoomDefinition['id'], workerId: WorkerId) => void;
}

export function Room({ room, isSelected, workerStatus, onSelectRoom }: RoomProps) {
  const [cx, cy, cz] = room.center3D;
  const [widthX, , depthZ] = room.size3D;
  const wallHeight = 1.65;
  const lowWallHeight = 0.75;
  const thickness = 0.14;

  const isNorthRoom = room.doorSide === 'south';
  const isSouthRoom = room.doorSide === 'north';
  const isReception = room.doorSide === 'east';

  return (
    <group position={[cx, cy, cz]} name={`Room_${room.id}`}>
      {/* Room Floor Pad (offset +0.025 on Y to prevent Z-fighting with base slab) */}
      <mesh
        position={[0, 0.025, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelectRoom(room.id, room.primaryWorkerId);
        }}
      >
        <boxGeometry args={[widthX - 0.16, 0.03, depthZ - 0.16]} />
        <meshStandardMaterial
          color={room.floorTint}
          roughness={0.65}
          metalness={0.2}
        />
      </mesh>

      {/* Room Perimeter Accent Strip (Highlights when selected) */}
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[widthX - 0.08, 0.018, depthZ - 0.08]} />
        <meshBasicMaterial
          color={room.accentColor}
          wireframe
          transparent
          opacity={isSelected ? 1.0 : 0.45}
        />
      </mesh>

      {/* Back Structural Wall */}
      {isNorthRoom && (
        <mesh position={[0, wallHeight / 2, -depthZ / 2 + thickness / 2]}>
          <boxGeometry args={[widthX, wallHeight, thickness]} />
          <meshStandardMaterial
            color={SCENE_COLORS.wallStructural}
            roughness={0.5}
            metalness={0.35}
          />
        </mesh>
      )}

      {isSouthRoom && (
        <mesh position={[0, lowWallHeight / 2, depthZ / 2 - thickness / 2]}>
          <boxGeometry args={[widthX, lowWallHeight, thickness]} />
          <meshStandardMaterial
            color={SCENE_COLORS.wallStructural}
            roughness={0.5}
            metalness={0.35}
          />
        </mesh>
      )}

      {isReception && (
        <mesh position={[-widthX / 2 + thickness / 2, wallHeight / 2, 0]}>
          <boxGeometry args={[thickness, wallHeight, depthZ]} />
          <meshStandardMaterial
            color={SCENE_COLORS.wallStructural}
            roughness={0.5}
            metalness={0.35}
          />
        </mesh>
      )}

      {/* Left & Right Side Partitions (Cutaway height for clear isometric line-of-sight) */}
      <mesh position={[-widthX / 2 + thickness / 2, 1.15 / 2, 0]}>
        <boxGeometry args={[thickness, 1.15, depthZ]} />
        <meshStandardMaterial
          color={SCENE_COLORS.wallStructural}
          roughness={0.55}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[widthX / 2 - thickness / 2, 0.9 / 2, 0]}>
        <boxGeometry args={[thickness, 0.9, depthZ]} />
        <meshStandardMaterial
          color={SCENE_COLORS.wallStructural}
          roughness={0.55}
          metalness={0.3}
        />
      </mesh>

      {/* Corridor Glass Partition with Framed Doorway Opening */}
      {(isNorthRoom || isSouthRoom) && (
        <group
          position={[
            0,
            0,
            isNorthRoom ? depthZ / 2 - thickness / 2 : -depthZ / 2 + thickness / 2,
          ]}
        >
          {/* Left Glass Panel */}
          <mesh position={[-widthX * 0.3, 1.25 / 2, 0]}>
            <boxGeometry args={[widthX * 0.34, 1.25, 0.06]} />
            <meshStandardMaterial
              color={room.accentColor}
              transparent
              opacity={0.22}
              roughness={0.2}
              metalness={0.1}
            />
          </mesh>
          {/* Right Glass Panel */}
          <mesh position={[widthX * 0.3, 1.25 / 2, 0]}>
            <boxGeometry args={[widthX * 0.34, 1.25, 0.06]} />
            <meshStandardMaterial
              color={room.accentColor}
              transparent
              opacity={0.22}
              roughness={0.2}
              metalness={0.1}
            />
          </mesh>
          {/* Left & Right Doorway Jambs */}
          <mesh position={[-widthX * 0.13, 1.35 / 2, 0]}>
            <boxGeometry args={[0.12, 1.35, 0.14]} />
            <meshStandardMaterial color={SCENE_COLORS.wallTrim} roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[widthX * 0.13, 1.35 / 2, 0]}>
            <boxGeometry args={[0.12, 1.35, 0.14]} />
            <meshStandardMaterial color={SCENE_COLORS.wallTrim} roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Doorway Threshold Accent Strip */}
          <mesh position={[0, 0.035, 0]}>
            <boxGeometry args={[widthX * 0.24, 0.018, 0.22]} />
            <meshBasicMaterial color={room.accentColor} />
          </mesh>
        </group>
      )}

      {/* Department-Specific Interior Props */}
      {room.roomType === 'reception' && (
        <group position={[1.4, 0, 0]}>
          {/* Holographic Command Routing Pedestal */}
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.65, 0.8, 0.84, 20]} />
            <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.86, 0]}>
            <cylinderGeometry args={[0.58, 0.58, 0.04, 20]} />
            <meshBasicMaterial color={room.accentColor} />
          </mesh>
        </group>
      )}

      {(room.roomType === 'research' ||
        room.roomType === 'analysis' ||
        room.roomType === 'strategy') && (
        <group position={[0, 1.05, -depthZ / 2 + 0.16]}>
          {/* Wall-Mounted Telemetry Display Panel */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[3.4, 0.85, 0.06]} />
            <meshStandardMaterial color="#090D16" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[3.2, 0.68, 0.01]} />
            <meshBasicMaterial
              color={room.accentColor}
              transparent
              opacity={workerStatus === 'BUSY' ? 0.65 : 0.3}
            />
          </mesh>
        </group>
      )}

      {(room.roomType === 'trading_ops' || room.roomType === 'market_monitor') && (
        <group position={[-widthX / 2 + 0.22, 0.65, 0]}>
          {/* Side Server & Guardrail Console */}
          <mesh position={[0, 0, -1.2]}>
            <boxGeometry args={[0.35, 1.2, 1.4]} />
            <meshStandardMaterial color="#111827" roughness={0.45} metalness={0.6} />
          </mesh>
          <mesh position={[0.18, 0.1, -1.2]}>
            <boxGeometry args={[0.02, 0.7, 1.1]} />
            <meshBasicMaterial color={room.accentColor} transparent opacity={0.55} />
          </mesh>
        </group>
      )}

      {room.roomType === 'archive' && (
        <group position={[-widthX / 2 + 0.45, 0.75, 0]}>
          {/* Archive Vault Evidence Server Racks */}
          {[-1.6, 0, 1.6].map((rackZ) => (
            <group key={`rack-${rackZ}`} position={[0, 0, rackZ]}>
              <mesh>
                <boxGeometry args={[0.6, 1.45, 0.95]} />
                <meshStandardMaterial color="#0F172A" roughness={0.4} metalness={0.7} />
              </mesh>
              <mesh position={[0.31, 0.2, 0]}>
                <boxGeometry args={[0.02, 0.85, 0.75]} />
                <meshBasicMaterial color={room.accentColor} transparent opacity={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
