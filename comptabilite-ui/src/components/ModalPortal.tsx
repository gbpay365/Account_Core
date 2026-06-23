import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalPortalProps = {
  children: ReactNode;
  /** Clicks on the non-interactive area can close (optional). Prefer handling close on the modal’s own backdrop (e.g. Jem shell). */
  onClose?: () => void;
};

/**
 * Renders into `document.body` at a high z-index. Does not add a second dimmed backdrop — use {@link JemShellModal} for the journal-style overlay.
 */
export function ModalPortal({ children, onClose }: ModalPortalProps) {
  return createPortal(
    <div
      className="modal-portal-layer"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 40px)',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        overflowY: 'auto',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) onClose();
      }}
    >
      <div
        style={{ width: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'min-content' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
