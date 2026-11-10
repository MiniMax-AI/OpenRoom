import type React from 'react';
import type { Expression, Mood } from '../../types';

/**
 * Contract for avatar renderers. The built-in DreamSprite implements it; a
 * licensed 3D (VRM) avatar renderer can implement the same props later and be
 * passed to AvatarStage instead.
 */
export interface AvatarRendererProps {
  expression: Expression;
  mood: Mood;
  /** Mood accent color (hex) for glow/tint */
  accent: string;
  /** True when motion should be minimal (prefers-reduced-motion) */
  reducedMotion: boolean;
}

export type AvatarRenderer = React.ComponentType<AvatarRendererProps>;
