import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './common.module.scss';

interface DrawerProps {
  side: 'left' | 'right';
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  testId: string;
  children: React.ReactNode;
}

/** Side drawer over the scene; becomes a bottom sheet in narrow windows (CSS). */
const Drawer: React.FC<DrawerProps> = ({
  side,
  open,
  title,
  closeLabel,
  onClose,
  testId,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside
        className={`${styles.drawer} ${side === 'left' ? styles.left : styles.right}`}
        role="dialog"
        aria-label={title}
        data-testid={testId}
      >
        <header className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>{title}</h2>
          <button className={styles.iconButton} onClick={onClose} aria-label={closeLabel}>
            <X size={18} />
          </button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
      </aside>
    </>
  );
};

export default Drawer;
