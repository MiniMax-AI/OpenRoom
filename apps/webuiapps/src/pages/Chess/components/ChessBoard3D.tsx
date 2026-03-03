import React, { useEffect, useState, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Piece3D } from './Piece3D';
import chessBg from '../assets/bg.jpg';

// ============ Types ============
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type Color = 'w' | 'b';
type Pos = [number, number];

interface PieceData {
  type: PieceType;
  color: Color;
}

type Board = (PieceData | null)[][];

interface TrackedPiece {
  id: string;
  type: PieceType;
  color: Color;
  row: number;
  col: number;
}

interface ChessBoard3DProps {
  board: Board;
  selectedPos: Pos | null;
  validTargets: Pos[];
  lastMove: { from: Pos; to: Pos } | null;
  checkKingPos: Pos | null;
  canInteract: boolean;
  onSquareClick: (_r: number, _c: number) => void;
}

// ============ Utilities ============
const posEq = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];

// Board square boxGeometry height=0.2, center y=0 -> top surface y=0.1
// Piece base bottom aligns with board top, +0.01 to prevent z-fighting
const BOARD_TOP = 0.1;
const PIECE_Y = BOARD_TOP + 0.01;

const toWorld = (row: number, col: number): [number, number, number] => {
  return [col - 3.5, PIECE_Y, row - 3.5];
};

const extractPieces = (board: Board): TrackedPiece[] => {
  const result: TrackedPiece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        result.push({
          id: `${p.color}-${p.type}-${r}-${c}`,
          type: p.type,
          color: p.color,
          row: r,
          col: c,
        });
      }
    }
  }
  return result;
};

// ============ Dark Square Texture (Three-color Blend) ============
const createDarkSquareTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  const S = 256;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Primary color 60%
  ctx.fillStyle = '#7B5C47';
  ctx.fillRect(0, 0, S, S);

  // Secondary color 1 (30%) - irregular patches
  ctx.fillStyle = '#8A6B56';
  for (let i = 0; i < 480; i++) {
    const bx = Math.random() * S;
    const by = Math.random() * S;
    const bw = 3 + Math.random() * 8;
    const bh = 3 + Math.random() * 8;
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.fillRect(bx, by, bw, bh);
  }

  // Secondary color 2 (10%) - small patches
  ctx.fillStyle = '#72533F';
  for (let i = 0; i < 160; i++) {
    const bx = Math.random() * S;
    const by = Math.random() * S;
    const bw = 2 + Math.random() * 6;
    const bh = 2 + Math.random() * 6;
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.fillRect(bx, by, bw, bh);
  }
  ctx.globalAlpha = 1;

  // Subtle noise for added texture
  for (let i = 0; i < 3000; i++) {
    const nx = Math.random() * S;
    const ny = Math.random() * S;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
    ctx.fillRect(nx, ny, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

// Cache texture
let _darkSquareTex: THREE.CanvasTexture | null = null;
const getDarkSquareTex = () => {
  if (!_darkSquareTex) _darkSquareTex = createDarkSquareTexture();
  return _darkSquareTex;
};

// ============ Board Squares ============
const BoardSquares: React.FC<{
  selectedPos: Pos | null;
  validTargets: Pos[];
  lastMove: { from: Pos; to: Pos } | null;
  checkKingPos: Pos | null;
  board: Board;
  onSquareClick: (_r: number, _c: number) => void;
}> = ({ selectedPos, validTargets, lastMove, checkKingPos, board, onSquareClick }) => {
  const squares: React.ReactNode[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isDark = (r + c) % 2 === 1;
      const [x, , z] = toWorld(r, c);

      const isSelected = selectedPos && posEq(selectedPos, [r, c]);
      const isLastMove = lastMove && (posEq(lastMove.from, [r, c]) || posEq(lastMove.to, [r, c]));
      const isCheck = checkKingPos && posEq(checkKingPos, [r, c]);
      const isValidTarget = validTargets.some((t) => posEq(t, [r, c]));
      const hasCapture = isValidTarget && board[r][c] !== null;

      // Light square solid color #D8B986 / Dark square three-color blend texture
      let squareColor = isDark ? '#7B5C47' : '#D8B986';
      let roughness = isDark ? 0.52 : 0.42;

      if (isSelected) {
        squareColor = '#81C784'; // Green selected
        roughness = 0.3;
      } else if (isCheck) {
        squareColor = '#c0392b'; // Red check
        roughness = 0.3;
      }

      // Dark squares use blended texture, light squares use solid color without texture
      const useDarkTex = isDark && !isSelected && !isCheck;
      const darkTex = getDarkSquareTex();

      squares.push(
        <group key={`sq-${r}-${c}`} position={[x, 0, z]}>
          <mesh
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onSquareClick(r, c);
            }}
          >
            <boxGeometry args={[1, 0.2, 1]} />
            <meshStandardMaterial
              color={squareColor}
              map={useDarkTex ? darkTex : null}
              roughness={roughness}
              metalness={0.1}
            />
          </mesh>

          {/* Last move yellow highlight */}
          {isLastMove && !isSelected && (
            <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial color="#FFF176" transparent opacity={0.5} />
            </mesh>
          )}

          {/* Check red overlay */}
          {isCheck && (
            <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial color="#e74c3c" transparent opacity={0.35} />
            </mesh>
          )}

          {/* Move indicator - green ring */}
          {isValidTarget && !hasCapture && (
            <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.1, 0.2, 32]} />
              <meshBasicMaterial color="#4CAF50" transparent opacity={0.8} />
            </mesh>
          )}

          {/* Capture indicator - red ring */}
          {isValidTarget && hasCapture && (
            <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.3, 0.42, 32]} />
              <meshBasicMaterial
                color="#e74c3c"
                transparent
                opacity={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>,
      );
    }
  }

  return <>{squares}</>;
};

// ============ Board Base and Decorations ============
const BoardBase: React.FC = () => {
  return (
    <group>
      {/* ===== Board base - dark hardwood ===== */}
      <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
        <boxGeometry args={[8.6, 0.4, 8.6]} />
        <meshStandardMaterial color="#2F1B15" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Inner gold border */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[4.05, 4.13, 4]} />
        <meshStandardMaterial color="#FFD700" roughness={0.2} metalness={0.8} />
      </mesh>

      {/* Outer gold border */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[4.18, 4.25, 4]} />
        <meshStandardMaterial color="#FFD700" roughness={0.2} metalness={0.8} />
      </mesh>
    </group>
  );
};

// ============ Adaptive Camera ============
// Dynamically adjust FOV based on viewport aspect ratio to ensure the board is fully visible and fills the screen
const CameraRig: React.FC = () => {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / size.height;
    const cam = camera as THREE.PerspectiveCamera;

    // Board with base is ~9 units wide, camera is ~10 units from center
    // Target horizontal half-angle ~ atan(4.5/10) + margin ~ 27deg, corresponding to horizontal FOV ~54deg
    const targetHalfH = (27 * Math.PI) / 180;
    const vFovFromH = 2 * Math.atan(Math.tan(targetHalfH) / aspect) * (180 / Math.PI);

    // Minimum vertical FOV to ensure board edges + piece tops are visible
    const minVFov = 46;

    cam.fov = Math.max(35, Math.min(80, Math.max(vFovFromH, minVFov)));
    cam.updateProjectionMatrix();
  }, [camera, size]);

  return null;
};

// ============ Main Component ============
const ChessBoard3D: React.FC<ChessBoard3DProps> = ({
  board,
  selectedPos,
  validTargets,
  lastMove,
  checkKingPos,
  canInteract,
  onSquareClick,
}) => {
  const [pieces, setPieces] = useState<TrackedPiece[]>(() => extractPieces(board));

  // Full-board reconciliation piece tracking
  useEffect(() => {
    const currentBoard: { type: PieceType; color: Color; row: number; col: number }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) currentBoard.push({ type: p.type, color: p.color, row: r, col: c });
      }
    }

    setPieces((prev) => {
      if (prev.length === 0) return extractPieces(board);

      const result: TrackedPiece[] = [];
      const usedIdx = new Set<number>();

      for (const cp of currentBoard) {
        let matchIdx = -1;

        // 1. Exact match
        matchIdx = prev.findIndex(
          (p, i) =>
            !usedIdx.has(i) &&
            p.row === cp.row &&
            p.col === cp.col &&
            p.type === cp.type &&
            p.color === cp.color,
        );

        // 2. lastMove match
        if (matchIdx === -1 && lastMove && cp.row === lastMove.to[0] && cp.col === lastMove.to[1]) {
          matchIdx = prev.findIndex(
            (p, i) =>
              !usedIdx.has(i) &&
              p.row === lastMove.from[0] &&
              p.col === lastMove.from[1] &&
              p.color === cp.color,
          );
        }

        // 3. Castling rook
        if (matchIdx === -1 && lastMove) {
          const movedPiece = board[lastMove.to[0]]?.[lastMove.to[1]];
          if (movedPiece?.type === 'K' && Math.abs(lastMove.to[1] - lastMove.from[1]) === 2) {
            const row = lastMove.to[0];
            const isKingside = lastMove.to[1] === 6;
            const rookFrom = isKingside ? 7 : 0;
            const rookTo = isKingside ? 5 : 3;
            if (cp.row === row && cp.col === rookTo && cp.type === 'R') {
              matchIdx = prev.findIndex(
                (p, i) =>
                  !usedIdx.has(i) &&
                  p.row === row &&
                  p.col === rookFrom &&
                  p.type === 'R' &&
                  p.color === cp.color,
              );
            }
          }
        }

        // 4. Fallback match
        if (matchIdx === -1) {
          matchIdx = prev.findIndex(
            (p, i) => !usedIdx.has(i) && p.type === cp.type && p.color === cp.color,
          );
        }

        if (matchIdx !== -1) {
          usedIdx.add(matchIdx);
          result.push({ ...prev[matchIdx], row: cp.row, col: cp.col, type: cp.type });
        } else {
          result.push({
            id: `${cp.color}-${cp.type}-${cp.row}-${cp.col}-${Date.now()}`,
            type: cp.type,
            color: cp.color,
            row: cp.row,
            col: cp.col,
          });
        }
      }

      return result;
    });
  }, [board, lastMove]);

  const selectedSquareKey = selectedPos ? `${selectedPos[0]}-${selectedPos[1]}` : null;

  const handleSquareClick = (r: number, c: number) => {
    if (!canInteract) return;
    onSquareClick(r, c);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundImage: `url(${chessBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Canvas shadows dpr={[1, 2]} gl={{ alpha: true }} style={{ background: 'transparent' }}>
        {/* Player perspective - camera pulled in, FOV dynamically adjusted by CameraRig */}
        <PerspectiveCamera makeDefault position={[0, 8.5, 5.5]} fov={50} />
        <OrbitControls
          enableRotate={false}
          enableZoom={false}
          enablePan={false}
          target={[0, 0, 0.5]}
        />
        <CameraRig />

        {/* ===== Global ambient light ===== */}
        <ambientLight intensity={0.5} color="#ffe8d0" />

        {/* ===== Left 45-degree directional light (main light source) ===== */}
        <directionalLight
          position={[-10, 10, 5]}
          intensity={1.2}
          color="#fff4e6"
          castShadow
          shadow-bias={-0.0002}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />

        {/* ===== Scene ===== */}
        <group>
          <BoardSquares
            selectedPos={selectedPos}
            validTargets={validTargets}
            lastMove={lastMove}
            checkKingPos={checkKingPos}
            board={board}
            onSquareClick={handleSquareClick}
          />

          {pieces.map((p) => (
            <Piece3D
              key={p.id}
              type={p.type}
              color={p.color}
              position={toWorld(p.row, p.col)}
              isSelected={selectedSquareKey === `${p.row}-${p.col}`}
              onClick={() => handleSquareClick(p.row, p.col)}
            />
          ))}
        </group>

        <BoardBase />

        <ContactShadows
          position={[0, -0.11, 0]}
          resolution={1024}
          scale={20}
          blur={1.5}
          opacity={0.6}
          far={2.5}
          color="#000000"
        />

        <Suspense fallback={null}>
          <Environment preset="lobby" />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ChessBoard3D;
