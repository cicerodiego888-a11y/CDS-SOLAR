'use client';

import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
};

export function Modal({
  open,
  title,
  children,
  confirmLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="ui-modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        <div className="ui-modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            {cancelLabel}
          </Button>
          {onConfirm ? (
            <Button type="button" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
