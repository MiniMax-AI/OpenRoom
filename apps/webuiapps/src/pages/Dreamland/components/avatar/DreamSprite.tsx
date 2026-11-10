import React, { useId } from 'react';
import type { Expression } from '../../types';
import type { AvatarRendererProps } from './types';
import styles from './Avatar.module.scss';

/**
 * Original stand-in avatar: a small floating "dream sprite" with a glowing
 * wisp tail. Expressions are drawn per emotion; breathing, floating and
 * blinking are CSS animations.
 */

const INK = '#2a2340';

interface Face {
  eyes: React.ReactNode;
  brows?: React.ReactNode;
  mouth: React.ReactNode;
  blush: number;
  arms: 'rest' | 'up' | 'together' | 'down';
}

const openEyes = (dx = 0, dy = 0, ry = 10) => (
  <g className={styles.blink}>
    <ellipse cx={82 + dx} cy={98 + dy} rx={7} ry={ry} fill={INK} />
    <ellipse cx={118 + dx} cy={98 + dy} rx={7} ry={ry} fill={INK} />
    <circle cx={84.5 + dx} cy={94 + dy} r={2.4} fill="#fff" />
    <circle cx={120.5 + dx} cy={94 + dy} r={2.4} fill="#fff" />
  </g>
);

const stroke = { stroke: INK, strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' };

const FACES: Record<Expression, Face> = {
  happy: {
    eyes: openEyes(),
    brows: (
      <>
        <path d="M74 80 Q82 75 90 79" {...stroke} strokeWidth={2.4} />
        <path d="M110 79 Q118 75 126 80" {...stroke} strokeWidth={2.4} />
      </>
    ),
    mouth: <path d="M86 116 Q100 132 114 116" {...stroke} />,
    blush: 0.35,
    arms: 'up',
  },
  shy: {
    eyes: openEyes(4, 4, 8),
    mouth: <path d="M92 122 Q96 119 100 122 Q104 125 108 122" {...stroke} strokeWidth={2.6} />,
    blush: 0.8,
    arms: 'together',
  },
  peaceful: {
    eyes: (
      <>
        <path d="M74 98 Q82 104 90 98" {...stroke} />
        <path d="M110 98 Q118 104 126 98" {...stroke} />
      </>
    ),
    mouth: <path d="M90 119 Q100 126 110 119" {...stroke} strokeWidth={2.8} />,
    blush: 0.3,
    arms: 'rest',
  },
  depressing: {
    eyes: (
      <g className={styles.blink}>
        <ellipse cx={82} cy={102} rx={6.5} ry={6} fill={INK} />
        <ellipse cx={118} cy={102} rx={6.5} ry={6} fill={INK} />
      </g>
    ),
    brows: (
      <>
        <path d="M73 86 L90 81" {...stroke} strokeWidth={2.6} />
        <path d="M127 86 L110 81" {...stroke} strokeWidth={2.6} />
      </>
    ),
    mouth: <path d="M88 126 Q100 117 112 126" {...stroke} strokeWidth={2.8} />,
    blush: 0.1,
    arms: 'down',
  },
  angry: {
    eyes: openEyes(0, 2, 8),
    brows: (
      <>
        <path d="M72 80 L92 88" {...stroke} />
        <path d="M128 80 L108 88" {...stroke} />
      </>
    ),
    mouth: <path d="M89 125 Q100 119 111 125" {...stroke} />,
    blush: 0.15,
    arms: 'down',
  },
};

const ARMS: Record<Face['arms'], [string, string]> = {
  rest: ['rotate(20 62 168)', 'rotate(-20 138 168)'],
  up: ['rotate(-35 62 168)', 'rotate(35 138 168)'],
  together: ['rotate(55 62 168) translate(10 -4)', 'rotate(-55 138 168) translate(-10 -4)'],
  down: ['rotate(8 62 168)', 'rotate(-8 138 168)'],
};

const DreamSprite: React.FC<AvatarRendererProps> = ({ expression, accent, reducedMotion }) => {
  const uid = useId().replace(/:/g, '');
  const face = FACES[expression];
  const [leftArm, rightArm] = ARMS[face.arms];
  const motion = reducedMotion ? styles.still : '';

  return (
    <svg
      viewBox="0 0 200 270"
      className={`${styles.sprite} ${styles[expression]} ${motion}`}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`aura-${uid}`}>
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6f3ff" />
          <stop offset="65%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`head-${uid}`} cx="40%" cy="35%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6e0ff" />
        </radialGradient>
      </defs>

      {/* ground glow */}
      <ellipse
        className={styles.shadow}
        cx="100"
        cy="258"
        rx="46"
        ry="7"
        fill={accent}
        opacity="0.35"
      />

      <g className={styles.float}>
        <circle cx="100" cy="130" r="98" fill={`url(#aura-${uid})`} className={styles.aura} />
        <g className={styles.breath}>
          {/* wisp tail body */}
          <path
            d="M100 132 C 58 140 56 200 92 238 C 96 244 104 246 106 238 C 140 200 142 140 100 132 Z"
            fill={`url(#body-${uid})`}
          />
          {/* arms */}
          <ellipse cx="62" cy="182" rx="9" ry="18" fill="#efeaff" transform={leftArm} />
          <ellipse cx="138" cy="182" rx="9" ry="18" fill="#efeaff" transform={rightArm} />
          {/* crest wisps */}
          <path d="M86 44 C 80 22 92 12 98 4 C 98 22 110 26 106 44 Z" fill={accent} opacity="0.9" />
          <path d="M70 52 C 58 38 62 26 66 18 C 70 34 82 36 82 48 Z" fill={accent} opacity="0.7" />
          <path
            d="M130 52 C 142 38 138 26 134 18 C 130 34 118 36 118 48 Z"
            fill={accent}
            opacity="0.7"
          />
          {/* head */}
          <circle cx="100" cy="100" r="58" fill={`url(#head-${uid})`} />
          {/* face */}
          {face.brows}
          {face.eyes}
          <ellipse cx="70" cy="116" rx="10" ry="6" fill="#ff8fab" opacity={face.blush} />
          <ellipse cx="130" cy="116" rx="10" ry="6" fill="#ff8fab" opacity={face.blush} />
          {expression === 'shy' && (
            <g {...stroke} strokeWidth={1.6} stroke="#ff6f91">
              <path d="M64 112 L60 118" />
              <path d="M70 112 L66 118" />
              <path d="M130 112 L126 118" />
              <path d="M136 112 L132 118" />
            </g>
          )}
          {face.mouth}
        </g>
      </g>
    </svg>
  );
};

export default DreamSprite;
