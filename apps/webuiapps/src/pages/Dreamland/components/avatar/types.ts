import type React from 'react';
import type { Expression, Mood } from '../../types';
import type { Offset } from '../../utils/parallax';

/**
 * Contract for avatar renderers. The built-in DreamSprite and the 3D
 * VrmAvatar implement it; AvatarStage picks one.
 */
export interface AvatarRendererProps {
  expression: Expression;
  mood: Mood;
  /** Mood accent color (hex) for glow/tint */
  accent: string;
  /** True when motion should be minimal (prefers-reduced-motion) */
  reducedMotion: boolean;
  /** The character's voice is speaking right now */
  speaking?: boolean;
  /** How open the mouth should be now, 0..1 (call per animation frame) */
  getMouthOpen?: () => number;
  /** Where the viewer is, -1..1 (pointer / tilt), for looking at them */
  viewer?: React.RefObject<Offset>;
}

export type AvatarRenderer = React.ComponentType<AvatarRendererProps>;

/** Extra props for renderers that load a model file. */
export interface ModelRendererProps extends AvatarRendererProps {
  modelUrl: string;
  onReady: () => void;
  onError: (reason: string) => void;
}
