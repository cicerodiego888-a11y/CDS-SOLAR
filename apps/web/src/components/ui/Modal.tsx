'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  error?: string;
  onConfirm?: () => void;
  onClose: () => void;
};

export function Modal({
  open,
  title,
  children,
  confirmLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  confirmDisabled = false,
  error,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="presentation">
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="ui-modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="ui-modal-body">
          {error ? <p className="ui-modal-error" role="alert">{error}</p> : null}
          {children}
        </div>
        <div className="ui-modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            {cancelLabel}
          </Button>
          {onConfirm ? (
            <Button type="button" onClick={onConfirm} disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
