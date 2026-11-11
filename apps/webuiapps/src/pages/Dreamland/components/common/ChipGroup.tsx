import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './common.module.scss';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface ChipGroupProps<T extends string> {
  label: string;
  name: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Single-select row of chips (radio group semantics). */
function ChipGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: ChipGroupProps<T>): React.ReactElement {
  return (
    <fieldset className={styles.chipGroup} data-testid={`dl-chips-${name}`}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.chips} role="radiogroup" aria-label={label}>
        {options.map(({ value: v, label: l, icon: Icon }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            data-value={v}
            className={`${styles.chip} ${v === value ? styles.chipActive : ''}`}
            onClick={() => v !== value && onChange(v)}
          >
            {Icon && <Icon size={14} />}
            <span>{l}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default ChipGroup;
