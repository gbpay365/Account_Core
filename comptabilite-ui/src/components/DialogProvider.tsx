import React, { useEffect, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { JemShellModal } from './jem/JemShellModal';
import './JournalEntry/JournalEntryForm.css';
import type { ToastEventDetail, ConfirmEventDetail } from '../utils/dialogs';

export const DialogProvider: React.FC = () => {
  const [toasts, setToasts] = useState<ToastEventDetail[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmEventDetail | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventDetail>;
      setToasts(prev => [...prev, customEvent.detail]);
      // Auto-remove toast after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== customEvent.detail.id));
      }, 4000);
    };

    const handleConfirm = (e: Event) => {
      const customEvent = e as CustomEvent<ConfirmEventDetail>;
      setConfirmConfig(customEvent.detail);
    };

    window.addEventListener('app:toast', handleToast);
    window.addEventListener('app:confirm', handleConfirm);

    return () => {
      window.removeEventListener('app:toast', handleToast);
      window.removeEventListener('app:confirm', handleConfirm);
    };
  }, []);

  const handleConfirmAction = () => {
    if (confirmConfig) {
      confirmConfig.onConfirm();
      setConfirmConfig(null);
    }
  };

  const handleCancelAction = () => {
    if (confirmConfig) {
      confirmConfig.onCancel();
      setConfirmConfig(null);
    }
  };

  return (
    <>
      {/* TOASTS CONTAINER */}
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div key={t.id} className="animate-fade-in" style={{
            background: t.type === 'error' ? 'var(--color-danger)' : t.type === 'success' ? 'var(--color-success)' : 'rgba(255,255,255,0.1)',
            color: 'white',
            padding: '14px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: '280px',
            maxWidth: '400px',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontWeight: 500,
            fontSize: '0.9rem'
          }}>
            <span style={{ fontSize: '1.2rem' }}>
              {t.type === 'error' ? '❌' : t.type === 'success' ? '✅' : 'ℹ️'}
            </span>
            <span>{t.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {confirmConfig && (
        <ModalPortal onClose={handleCancelAction}>
          <JemShellModal
            title={confirmConfig.title || 'Confirmation required'}
            onClose={handleCancelAction}
            size="sm"
            footer={
              <>
                <button type="button" onClick={handleCancelAction} className="jem-btn-ghost">
                  Cancel
                </button>
                <button type="button" onClick={handleConfirmAction} className="jem-btn-primary">
                  Confirm
                </button>
              </>
            }
          >
            <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', lineHeight: 1.55, fontSize: '0.95rem' }}>{confirmConfig.message}</p>
          </JemShellModal>
        </ModalPortal>
      )}
    </>
  );
};
