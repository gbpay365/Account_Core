import React from 'react';
import { X, ChevronRight } from 'lucide-react';
import '../JournalEntry/JournalEntryForm.css';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export type JemShellModalProps = {
  title: string;
  subtitle?: string;
  /** Optional right pill, e.g. type code (like journal JNL) */
  pill?: string;
  onClose: () => void;
  size?: Size;
  /** Wider / multi-column content (e.g. journal form body). */
  wideBody?: boolean;
  className?: string;
  /** Optional class on the `jem-body` wrapper (e.g. for scroll behavior). */
  bodyClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  titleId?: string;
};

/**
 * Standard modal shell matching “New Journal Entry” (backdrop, mark, header, jem field tokens).
 * Wrap with {@link import('../ModalPortal').ModalPortal} to render above the app.
 */
export const JemShellModal: React.FC<JemShellModalProps> = ({
  title,
  subtitle,
  pill,
  onClose,
  size = 'md',
  wideBody = false,
  className = '',
  bodyClassName = '',
  children,
  footer,
  titleId = 'jem-shell-title',
}) => {
  return (
    <div className="jem-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        className={`jem-backdrop__inner jem-backdrop__inner--${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={['jem', `jem--${size}`, 'jem--modal', className]
            .filter(Boolean)
            .join(' ')}
        >
          <header className="jem-header">
            <div className="jem-header__left">
              <div className="jem-mark" aria-hidden>
                <span />
                <span />
                <span />
                <span />
              </div>
              <div>
                <div className="jem-header__title-row">
                  <h1 className="jem-header__title" id={titleId}>
                    {title}
                  </h1>
                  {pill != null && pill !== '' && (
                    <>
                      <ChevronRight className="jem-chevron" />
                      <span className="jem-type-pill">{pill}</span>
                    </>
                  )}
                </div>
                {subtitle ? <p className="jem-subtitle">{subtitle}</p> : null}
              </div>
            </div>
            <button type="button" onClick={onClose} className="jem-close" aria-label="Close">
              <X width={20} height={20} />
            </button>
          </header>
          {wideBody ? (
            <div className={['jem-body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
          ) : (
            <div className={['jem-body jem-body--modal-stack', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
          )}
          {footer ? <div className="jem-footer jem-footer--modalBar">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
};
