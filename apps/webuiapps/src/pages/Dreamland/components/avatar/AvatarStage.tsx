import React, { Suspense, useCallback, useEffect, useState } from 'react';
import type { Dreamspace } from '../../types';
import type { Offset } from '../../utils/parallax';
import { moodAccent } from '../../utils/sceneStyle';
import { useSpeechActivity } from '../../hooks/useSpeechActivity';
import DreamSprite from './DreamSprite';
import type { AvatarRenderer } from './types';
import styles from './Avatar.module.scss';

/** three.js is large: only download it when a 3D model is set. */
const VrmAvatar = React.lazy(() => import('./VrmAvatar'));

interface AvatarStageProps {
  dream: Dreamspace;
  name: string;
  label: string;
  reducedMotion: boolean;
  onPoke: () => void;
  /** The user's 3D model, or null for the built-in sprite */
  modelUrl?: string | null;
  /** The model could not be shown this visit */
  modelFailed?: boolean;
  onModelError?: (reason: string) => void;
  /** Where the viewer is (pointer / tilt), for the 3D companion's gaze */
  viewer?: React.RefObject<Offset>;
  /** Swap in another 2D renderer */
  renderer?: AvatarRenderer;
}

/**
 * Places the companion with its name and an optional caption bubble. With a
 * 3D model it shows the model (framed from the thighs up, standing at the
 * bottom of the scene) once it has loaded, and the dream sprite until then or
 * if it fails.
 */
const AvatarStage: React.FC<AvatarStageProps> = ({
  dream,
  name,
  label,
  reducedMotion,
  onPoke,
  modelUrl = null,
  modelFailed = false,
  onModelError,
  viewer,
  renderer: Renderer = DreamSprite,
}) => {
  const [bounce, setBounce] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const { speaking, getMouthOpen } = useSpeechActivity();
  const useModel = !!modelUrl && !modelFailed;
  const showModel = useModel && modelReady;

  useEffect(() => setModelReady(false), [modelUrl]);

  useEffect(() => {
    if (!bounce) return;
    const timer = setTimeout(() => setBounce(0), 600);
    return () => clearTimeout(timer);
  }, [bounce]);

  const poke = useCallback(() => {
    setBounce((n) => n + 1);
    onPoke();
  }, [onPoke]);

  const handleReady = useCallback(() => setModelReady(true), []);
  const handleError = useCallback(
    (reason: string) => {
      setModelReady(false);
      onModelError?.(reason);
    },
    [onModelError],
  );

  const accent = moodAccent(dream.mood);
  const rendererProps = {
    expression: dream.expression,
    mood: dream.mood,
    accent,
    reducedMotion,
    speaking,
    getMouthOpen,
    viewer,
  };

  return (
    <div className={`${styles.stage} ${showModel ? styles.stageModel : ''}`}>
      {dream.caption && (
        <div className={styles.caption} data-testid="dl-caption">
          {dream.caption}
        </div>
      )}
      <button
        type="button"
        className={[
          styles.avatarButton,
          showModel ? styles.modelButton : styles.spriteButton,
          bounce && !reducedMotion ? styles.bounce : '',
        ].join(' ')}
        onClick={poke}
        aria-label={name ? `${label}: ${name}` : label}
        data-testid="dl-avatar"
        data-expression={dream.expression}
        data-renderer={showModel ? 'vrm' : 'sprite'}
        data-speaking={speaking ? 'true' : 'false'}
      >
        {useModel && modelUrl && (
          <Suspense fallback={null}>
            <VrmAvatar
              {...rendererProps}
              modelUrl={modelUrl}
              onReady={handleReady}
              onError={handleError}
            />
          </Suspense>
        )}
        {!showModel && <Renderer {...rendererProps} />}
      </button>
      {name && <div className={styles.nameTag}>{name}</div>}
    </div>
  );
};

export default AvatarStage;
