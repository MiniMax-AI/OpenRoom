import React from 'react';
import type { Toast as ToastData } from '../../store/controller';
import styles from './common.module.scss';

const Toast: React.FC<{ toast: ToastData | null }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className={`${styles.toast} ${toast.error ? styles.toastError : ''}`}
      role="status"
      aria-live="polite"
      data-testid="dl-toast"
    >
      {toast.message}
    </div>
  );
};

export default Toast;
