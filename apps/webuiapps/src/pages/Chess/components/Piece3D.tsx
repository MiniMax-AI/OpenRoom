import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animated, useSpring } from '@react-spring/three';
import { useTexture } from '@react-three/drei';
import whiteMarbleImg from '../assets/white.png';
import blackMarbleImg from '../assets/black.png';

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceColor = 'w' | 'b';

interface Piece3DProps {
  type: PieceType;
  color: PieceColor;
  position: [number, number, number];
  onClick?: () => void;
  isSelected?: boolean;
}

// ============ Profile Scaling (independent width/height control) ============
const sc = (pts: [number, number][], sx: number, sy: number) =>
  pts.map(([x, y]) => new THREE.Vector2(x * sx, y * sy));

// ============ Standard Staunton Profiles ============
const PAWN: [number, number][] = [
  [0, 0],
  [0.35, 0],
  [0.35, 0.1],
  [0.3, 0.2],
  [0.2, 0.45],
  [0.15, 0.65],
  [0.2, 0.7],
  [0.1, 0.75],
  [0.15, 0.9],
  [0, 0.9],
];
const ROOK: [number, number][] = [
  [0, 0],
  [0.42, 0],
  [0.42, 0.12],
  [0.36, 0.18],
  [0.3, 0.65],
  [0.36, 0.7],
  [0.36, 0.85],
  [0.3, 0.9],
  [0, 0.9],
];
const BISHOP: [number, number][] = [
  [0, 0],
  [0.38, 0],
  [0.38, 0.1],
  [0.28, 0.22],
  [0.16, 0.55],
  [0.22, 0.65],
  [0.22, 0.82],
  [0.06, 1.0],
  [0, 1.0],
];
const QUEEN: [number, number][] = [
  [0, 0],
  [0.42, 0],
  [0.42, 0.12],
  [0.32, 0.24],
  [0.2, 0.6],
  [0.28, 0.72],
  [0.34, 0.88],
  [0.22, 0.95],
  [0.22, 1.05],
  [0, 1.05],
];
const KING: [number, number][] = [
  [0, 0],
  [0.46, 0],
  [0.46, 0.12],
  [0.36, 0.24],
  [0.26, 0.6],
  [0.34, 0.72],
  [0.4, 0.88],
  [0.28, 0.95],
  [0.28, 1.08],
  [0, 1.08],
];

// ============ Piece Size Ratios (width, height) ============
// Real proportions: P(0.47) < R(0.58) < N(0.63) < B(0.74) < Q(0.89) < K(1.0)
const SZ = {
  P: { sx: 0.36, sy: 0.85 }, // Short and stout
  R: { sx: 0.4, sy: 1.05 }, // Medium-short wide
  N: { sx: 0.4, sy: 1.1 }, // Medium
  B: { sx: 0.36, sy: 1.25 }, // Medium-tall slim
  Q: { sx: 0.38, sy: 1.4 }, // Tall
  K: { sx: 0.4, sy: 1.5 }, // Tallest
};

// ============ Marble Material (Image Texture) ============
const W_MARBLE_PROPS = {
  roughness: 0.28,
  metalness: 0.05,
  clearcoat: 0.6,
  clearcoatRoughness: 0.25,
};

const B_MARBLE_PROPS = {
  roughness: 0.06,
  metalness: 0.15,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
};

const MarbleMat: React.FC<{ c: PieceColor; doubleSide?: boolean }> = ({ c, doubleSide }) => {
  const tex = useTexture(c === 'w' ? whiteMarbleImg : blackMarbleImg);
  return (
    <meshPhysicalMaterial
      map={tex}
      {...(c === 'w' ? W_MARBLE_PROPS : B_MARBLE_PROPS)}
      side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
    />
  );
};

const GoldMat: React.FC = () => (
  <meshStandardMaterial color="#FFD700" roughness={0.15} metalness={1.0} />
);

// ============ Piece Geometry ============
const PieceGeometry: React.FC<{ type: PieceType; color: PieceColor }> = ({ type, color }) => {
  const geo = useMemo(() => {
    const { sx, sy } = SZ[type];
    let points: THREE.Vector2[];
    let top: React.ReactNode = null;
    const hasGold = type !== 'P';
    // Actual height of each piece's lathe body
    const bodyH =
      type === 'N' ? 0 : (type === 'P' ? 0.9 : type === 'R' ? 0.9 : type === 'B' ? 1.0 : 1.05) * sy;

    switch (type) {
      // ===== Pawn - pure marble =====
      case 'P': {
        points = sc(PAWN, sx, sy);
        const h = 0.9 * sy;
        top = (
          <mesh position={[0, h * 0.82, 0]} castShadow>
            <sphereGeometry args={[sx * 0.55, 32, 32]} />
            <MarbleMat c={color} />
          </mesh>
        );
        break;
      }

      // ===== Rook - gold castle top =====
      case 'R': {
        points = sc(ROOK, sx, sy);
        const h = 0.9 * sy;
        top = (
          <group position={[0, h * 0.76, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[sx * 0.72, sx * 0.72, h * 0.22, 6]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Gold top ring */}
            <mesh position={[0, h * 0.11, 0]}>
              <torusGeometry args={[sx * 0.72, 0.025, 12, 6]} />
              <GoldMat />
            </mesh>
            {/* Gold belt */}
            <mesh position={[0, -h * 0.05, 0]}>
              <cylinderGeometry args={[sx * 0.76, sx * 0.76, 0.05, 32]} />
              <GoldMat />
            </mesh>
          </group>
        );
        break;
      }

      // ===== Bishop - gold tip ball + collar =====
      case 'B': {
        points = sc(BISHOP, sx, sy);
        const h = 1.0 * sy;
        top = (
          <group>
            <mesh position={[0, h * 0.78, 0]} castShadow>
              <sphereGeometry args={[sx * 0.55, 32, 16, 0, Math.PI * 1.8]} />
              <MarbleMat c={color} doubleSide />
            </mesh>
            {/* Gold tip ball */}
            <mesh position={[0, h * 0.92, 0]}>
              <sphereGeometry args={[0.065, 16, 16]} />
              <GoldMat />
            </mesh>
            {/* Gold collar */}
            <mesh position={[0, h * 0.6, 0]}>
              <torusGeometry args={[sx * 0.5, 0.025, 12, 32]} />
              <GoldMat />
            </mesh>
          </group>
        );
        break;
      }

      // ===== Knight - gold mane + collar =====
      case 'N': {
        const s = sy * 0.85; // Overall height factor
        return (
          <group>
            {/* Base */}
            <mesh position={[0, 0.12 * s, 0]} castShadow>
              <cylinderGeometry args={[sx * 0.72, sx * 0.84, 0.24 * s, 32]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Gold collar */}
            <mesh position={[0, 0.3 * s, 0]}>
              <cylinderGeometry args={[sx * 0.64, sx * 0.64, 0.06 * s, 32]} />
              <GoldMat />
            </mesh>
            {/* Body */}
            <mesh position={[0, 0.62 * s, 0]} castShadow>
              <boxGeometry args={[sx * 0.7, 0.6 * s, sx * 0.56]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.92 * s, 0.12 * s]} rotation={[0.2, 0, 0]} castShadow>
              <boxGeometry args={[sx * 0.56, 0.3 * s, sx * 1.0]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Gold mane */}
            <mesh position={[0, 0.82 * s, -0.18 * s]}>
              <boxGeometry args={[sx * 0.28, 0.48 * s, sx * 0.28]} />
              <GoldMat />
            </mesh>
            {/* Gold ear tip */}
            <mesh position={[0, 1.08 * s, 0.06 * s]}>
              <coneGeometry args={[0.045, 0.12 * s, 8]} />
              <GoldMat />
            </mesh>
            {/* Gold base ring */}
            <mesh position={[0, 0.18 * s, 0]}>
              <torusGeometry args={[sx * 0.74, 0.025, 16, 64]} />
              <GoldMat />
            </mesh>
          </group>
        );
      }

      // ===== Queen - gold crown with 5 points =====
      case 'Q': {
        points = sc(QUEEN, sx, sy);
        const h = 1.05 * sy;
        top = (
          <group position={[0, h * 0.78, 0]}>
            {/* Spherical top */}
            <mesh castShadow>
              <sphereGeometry args={[sx * 0.44, 32, 32]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Crown base ring */}
            <mesh position={[0, sx * 0.15, 0]}>
              <torusGeometry args={[sx * 0.46, 0.025, 12, 32]} />
              <GoldMat />
            </mesh>
            {/* 5 crown points */}
            {[0, 1, 2, 3, 4].map((i) => {
              const angle = (i / 5) * Math.PI * 2;
              const px = Math.sin(angle) * sx * 0.38;
              const pz = Math.cos(angle) * sx * 0.38;
              return (
                <mesh key={`crown-${i}`} position={[px, sx * 0.42, pz]}>
                  <coneGeometry args={[0.035, 0.13, 6]} />
                  <GoldMat />
                </mesh>
              );
            })}
            {/* Top gold sphere */}
            <mesh position={[0, sx * 0.52, 0]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <GoldMat />
            </mesh>
            {/* Gold belt */}
            <mesh position={[0, -sx * 0.3, 0]}>
              <torusGeometry args={[sx * 0.58, 0.025, 12, 32]} />
              <GoldMat />
            </mesh>
          </group>
        );
        break;
      }

      // ===== King - gold cross =====
      case 'K': {
        points = sc(KING, sx, sy);
        const h = 1.08 * sy;
        top = (
          <group position={[0, h * 0.82, 0]}>
            {/* Head */}
            <mesh castShadow>
              <boxGeometry args={[sx * 0.42, sx * 0.42, sx * 0.42]} />
              <MarbleMat c={color} />
            </mesh>
            {/* Gold cross */}
            <group position={[0, sx * 0.55, 0]}>
              <mesh>
                <boxGeometry args={[0.06, 0.3, 0.06]} />
                <GoldMat />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <boxGeometry args={[0.2, 0.06, 0.06]} />
                <GoldMat />
              </mesh>
            </group>
            {/* Gold belt */}
            <mesh position={[0, -sx * 0.25, 0]}>
              <torusGeometry args={[sx * 0.68, 0.025, 12, 32]} />
              <GoldMat />
            </mesh>
            {/* Gold bottom collar */}
            <mesh position={[0, -sx * 0.5, 0]}>
              <cylinderGeometry args={[sx * 0.72, sx * 0.72, 0.05, 32]} />
              <GoldMat />
            </mesh>
          </group>
        );
        break;
      }

      default:
        points = sc(PAWN, SZ.P.sx, SZ.P.sy);
    }

    // latheGeometry only generates a rotational surface (hollow shell), bottom face normals face down and get back-face culled.
    // Solution:
    //   1. Add cylinderGeometry solid base (has correct top/bottom caps)
    //   2. lathe uses DoubleSide to ensure opacity from any angle
    const pedH = 0.12;

    return (
      <group>
        {/* Solid base - cylinderGeometry with correct top/bottom cap normals */}
        <mesh position={[0, pedH / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[sx * 0.7, sx * 0.85, pedH, 32]} />
          <MarbleMat c={color} />
        </mesh>
        {/* Lathe body - DoubleSide ensures shell is not see-through */}
        <mesh castShadow receiveShadow>
          <latheGeometry args={[points!, 64]} />
          <MarbleMat c={color} doubleSide />
        </mesh>
        {hasGold && (
          <mesh position={[0, bodyH * 0.18, 0]}>
            <torusGeometry args={[sx * 0.74, 0.025, 16, 64]} />
            <GoldMat />
          </mesh>
        )}
        {top}
      </group>
    );
  }, [type, color]);

  return <>{geo}</>;
};

// ============ Export ============
export const Piece3D: React.FC<Piece3DProps> = ({ type, color, position, onClick, isSelected }) => {
  // Position immediately on first render, play spring animation for subsequent moves
  const isFirstRender = useRef(true);
  const springs = useSpring({
    x: position[0],
    y: position[1],
    z: position[2],
    immediate: isFirstRender.current,
    config: { mass: 1, tension: 170, friction: 26 },
  });
  if (isFirstRender.current) isFirstRender.current = false;

  return (
    <animated.group
      position-x={springs.x}
      position-y={springs.y}
      position-z={springs.z}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isSelected && (
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.42, 0.48, 0.05, 32]} />
          <meshBasicMaterial color="#81C784" opacity={0.5} transparent />
        </mesh>
      )}
      {isSelected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.54, 32]} />
          <meshBasicMaterial color="#4CAF50" side={THREE.DoubleSide} />
        </mesh>
      )}
      <PieceGeometry type={type} color={color} />
    </animated.group>
  );
};
