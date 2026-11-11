import React from 'react';
import styles from './common.module.scss';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} onClick={onCancel}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-label={title}
        data-testid="dl-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalMessage}>{message}</p>
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={styles.dangerButton} onClick={onConfirm} data-testid="dl-confirm-ok">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
