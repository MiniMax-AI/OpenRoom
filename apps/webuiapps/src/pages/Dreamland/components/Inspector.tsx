import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CloudFog,
  CloudRain,
  Flower2,
  ImageOff,
  Loader2,
  Moon,
  Music,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Wand2,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import {
  AMBIENT_SOUNDS,
  EXPRESSIONS,
  MOODS,
  TIMES_OF_DAY,
  WEATHERS,
  type Dreamspace,
  type DreamspacePatch,
} from '../types';
import { NAME_MAX, PROMPT_MAX } from '../utils/normalize';
import Drawer from './common/Drawer';
import ChipGroup, { type ChipOption } from './common/ChipGroup';
import common from './common/common.module.scss';
import styles from '../index.module.scss';

const TIME_ICONS: Record<Dreamspace['timeOfDay'], LucideIcon> = {
  dawn: Sunrise,
  day: Sun,
  dusk: Sunset,
  night: Moon,
};

const WEATHER_ICONS: Record<Dreamspace['weather'], LucideIcon> = {
  clear: Sun,
  rain: CloudRain,
  snow: Snowflake,
  fog: CloudFog,
  fireflies: Sparkles,
  stars: Star,
  petals: Flower2,
};

const SOUND_ICONS: Record<Dreamspace['ambientSound'], LucideIcon> = {
  none: VolumeX,
  rain: CloudRain,
  wind: Wind,
  ocean: Waves,
  night: Moon,
  drone: Music,
};

interface InspectorProps {
  open: boolean;
  dream: Dreamspace;
  generating: boolean;
  imageGenAvailable: boolean;
  volume: number;
  onClose: () => void;
  onChange: (patch: DreamspacePatch) => void;
  onEditText: (field: 'name' | 'scenePrompt', value: string) => void;
  onCommitText: (field: 'name' | 'scenePrompt') => void;
  onRegenerate: () => void;
  onVolume: (volume: number) => void;
}

const Inspector: React.FC<InspectorProps> = ({
  open,
  dream,
  generating,
  imageGenAvailable,
  volume,
  onClose,
  onChange,
  onEditText,
  onCommitText,
  onRegenerate,
  onVolume,
}) => {
  const { t } = useTranslation('dreamland');

  function options<T extends string>(
    values: readonly T[],
    group: string,
    icons?: Record<T, LucideIcon>,
  ): ChipOption<T>[] {
    return values.map((value) => ({ value, label: t(`${group}.${value}`), icon: icons?.[value] }));
  }

  return (
    <Drawer
      side="right"
      open={open}
      title={t('inspector.title')}
      closeLabel={t('inspector.close')}
      onClose={onClose}
      testId="dl-inspector"
    >
      <label className={common.fieldLabel} htmlFor="dl-name">
        {t('inspector.name')}
      </label>
      <input
        id="dl-name"
        className={styles.input}
        value={dream.name}
        maxLength={NAME_MAX}
        placeholder={t('inspector.namePlaceholder')}
        onChange={(e) => onEditText('name', e.target.value)}
        onBlur={() => onCommitText('name')}
        data-testid="dl-name-input"
      />

      <label className={common.fieldLabel} htmlFor="dl-scene">
        {t('inspector.scene')}
      </label>
      <textarea
        id="dl-scene"
        className={`${styles.input} ${styles.textarea}`}
        value={dream.scenePrompt}
        maxLength={PROMPT_MAX}
        rows={3}
        placeholder={t('inspector.scenePlaceholder')}
        onChange={(e) => onEditText('scenePrompt', e.target.value)}
        onBlur={() => onCommitText('scenePrompt')}
        data-testid="dl-scene-input"
      />
      <div className={styles.generateRow}>
        <button
          className={common.primaryButton}
          onClick={onRegenerate}
          disabled={generating || !imageGenAvailable}
          data-testid="dl-regenerate-btn"
        >
          {generating ? <Loader2 size={16} className={styles.spin} /> : <Wand2 size={16} />}
          {generating ? t('inspector.generating') : t('inspector.regenerate')}
        </button>
        {dream.backgroundUrl && !generating && (
          <button
            className={common.iconButton}
            onClick={() => onChange({ backgroundUrl: null })}
            aria-label={t('inspector.clearImage')}
            title={t('inspector.clearImage')}
            data-testid="dl-clear-image-btn"
          >
            <ImageOff size={16} />
          </button>
        )}
      </div>
      {!imageGenAvailable && <p className={styles.hint}>{t('inspector.imageGenUnavailable')}</p>}

      <ChipGroup
        label={t('inspector.timeOfDay')}
        name="timeOfDay"
        options={options(TIMES_OF_DAY, 'timeOfDay', TIME_ICONS)}
        value={dream.timeOfDay}
        onChange={(timeOfDay) => onChange({ timeOfDay })}
      />
      <ChipGroup
        label={t('inspector.weather')}
        name="weather"
        options={options(WEATHERS, 'weather', WEATHER_ICONS)}
        value={dream.weather}
        onChange={(weather) => onChange({ weather })}
      />
      <ChipGroup
        label={t('inspector.mood')}
        name="mood"
        options={options(MOODS, 'mood')}
        value={dream.mood}
        onChange={(mood) => onChange({ mood })}
      />
      <ChipGroup
        label={t('inspector.sound')}
        name="ambientSound"
        options={options(AMBIENT_SOUNDS, 'sound', SOUND_ICONS)}
        value={dream.ambientSound}
        onChange={(ambientSound) => onChange({ ambientSound })}
      />
      <label className={common.fieldLabel} htmlFor="dl-volume">
        {t('inspector.volume')}
      </label>
      <div className={styles.volumeRow}>
        <VolumeX size={14} />
        <input
          id="dl-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          className={styles.range}
          data-testid="dl-volume"
        />
        <Volume2 size={14} />
      </div>
      <ChipGroup
        label={t('inspector.expression')}
        name="expression"
        options={options(EXPRESSIONS, 'expression')}
        value={dream.expression}
        onChange={(expression) => onChange({ expression })}
      />
    </Drawer>
  );
};

export default Inspector;
