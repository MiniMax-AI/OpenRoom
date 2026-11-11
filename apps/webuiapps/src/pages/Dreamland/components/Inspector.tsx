import React, { useRef } from 'react';
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
  Trash2,
  Upload,
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
  type AvatarModelInfo,
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
  onUsePaintedSky: () => void;
  onVolume: (volume: number) => void;
  /** 3D companion model */
  avatarModel: AvatarModelInfo | null;
  avatarBusy: boolean;
  avatarFailed: boolean;
  onUploadModel: (file: File) => void;
  onRemoveModel: () => void;
  /** Tilt switch, shown on phones/tablets only */
  tilt: { available: boolean; enabled: boolean; onToggle: (enabled: boolean) => void };
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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
  onUsePaintedSky,
  onVolume,
  avatarModel,
  avatarBusy,
  avatarFailed,
  onUploadModel,
  onRemoveModel,
  tilt,
}) => {
  const { t } = useTranslation('dreamland');
  const fileInput = useRef<HTMLInputElement>(null);

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
            onClick={onUsePaintedSky}
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

      {tilt.available && (
        <div className={styles.switchRow}>
          <div>
            <span className={common.fieldLabel}>{t('motion.label')}</span>
            <p className={styles.hint}>{t('motion.hint')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tilt.enabled}
            aria-label={t('motion.label')}
            className={`${styles.switch} ${tilt.enabled ? styles.switchOn : ''}`}
            onClick={() => tilt.onToggle(!tilt.enabled)}
            data-testid="dl-tilt-toggle"
          >
            <span className={styles.switchKnob} />
          </button>
        </div>
      )}

      <section className={styles.companion} data-testid="dl-companion">
        <span className={common.fieldLabel}>{t('companion.title')}</span>
        <p className={styles.companionStatus} data-testid="dl-companion-status">
          {avatarModel
            ? `${avatarModel.fileName} · ${formatSize(avatarModel.size)}`
            : t('companion.none')}
        </p>
        {avatarModel?.storage === 'browser' && (
          <p className={styles.hint}>{t('companion.browserOnly')}</p>
        )}
        {avatarModel && avatarFailed && (
          <p className={styles.hint} data-testid="dl-companion-failed">
            {t('companion.failed')}
          </p>
        )}
        <div className={styles.generateRow}>
          <button
            type="button"
            className={common.primaryButton}
            onClick={() => fileInput.current?.click()}
            disabled={avatarBusy}
            data-testid="dl-model-upload-btn"
          >
            {avatarBusy ? <Loader2 size={16} className={styles.spin} /> : <Upload size={16} />}
            {avatarBusy
              ? t('companion.uploading')
              : avatarModel
                ? t('companion.replace')
                : t('companion.upload')}
          </button>
          {avatarModel && !avatarBusy && (
            <button
              type="button"
              className={common.iconButton}
              onClick={onRemoveModel}
              aria-label={t('companion.remove')}
              title={t('companion.remove')}
              data-testid="dl-model-remove-btn"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          // No accept filter: iOS greys out .vrm files it doesn't know; the app checks the file itself
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUploadModel(file);
          }}
          data-testid="dl-model-input"
        />
        <p className={styles.hint}>{t('companion.hint')}</p>
      </section>
    </Drawer>
  );
};

export default Inspector;
