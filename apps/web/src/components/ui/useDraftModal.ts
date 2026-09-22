'use client';

import { useCallback, useRef, useState } from 'react';

function isDomEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (typeof Event !== 'undefined' && value instanceof Event) return true;
  return 'nativeEvent' in value || 'currentTarget' in value;
}

function formFields<TForm extends object>(emptyForm: TForm, source?: Partial<TForm> | null): TForm {
  const next = { ...emptyForm };
  if (!source || isDomEvent(source)) return next;
  for (const key of Object.keys(emptyForm) as Array<keyof TForm>) {
    if (key in source) next[key] = source[key] as TForm[keyof TForm];
  }
  return next;
}

export function useDraftModal<TForm extends object, TRow extends { id: string }>(emptyForm: TForm) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TRow | null>(null);
  const [form, setForm] = useState<TForm>(emptyForm);
  const formRef = useRef(form);
  const editingRef = useRef(editing);
  const createDraftRef = useRef<TForm | null>(null);
  const editDraftRef = useRef<{ id: string; form: TForm } | null>(null);

  formRef.current = form;
  editingRef.current = editing;

  const close = useCallback(() => {
    const currentForm = formFields(emptyForm, formRef.current);
    const currentEditing = editingRef.current;
    if (currentEditing) editDraftRef.current = { id: currentEditing.id, form: currentForm };
    else createDraftRef.current = currentForm;
    setOpen(false);
  }, [emptyForm]);

  const openCreate = useCallback((defaults?: Partial<TForm>) => {
    const currentForm = formFields(emptyForm, formRef.current);
    const currentEditing = editingRef.current;
    if (currentEditing) {
      editDraftRef.current = { id: currentEditing.id, form: currentForm };
      setEditing(null);
    }
    const extra = isDomEvent(defaults) ? undefined : defaults;
    const draft = createDraftRef.current;
    setForm(formFields(emptyForm, draft ? { ...draft, ...extra } : extra));
    setOpen(true);
  }, [emptyForm]);

  const openEdit = useCallback((row: TRow, fromRow: (row: TRow) => TForm) => {
    const currentForm = formFields(emptyForm, formRef.current);
    const currentEditing = editingRef.current;
    if (currentEditing) {
      editDraftRef.current = { id: currentEditing.id, form: currentForm };
    } else {
      createDraftRef.current = currentForm;
    }
    setEditing(row);
    const draft = editDraftRef.current;
    setForm(draft?.id === row.id ? formFields(emptyForm, draft.form) : fromRow(row));
    setOpen(true);
  }, [emptyForm]);

  const clearAfterSave = useCallback(() => {
    const currentEditing = editingRef.current;
    if (currentEditing && editDraftRef.current?.id === currentEditing.id) {
      editDraftRef.current = null;
    }
    if (!currentEditing) createDraftRef.current = null;
    setEditing(null);
    setForm(emptyForm);
    setOpen(false);
  }, [emptyForm]);

  return { open, editing, form, setForm, openCreate, openEdit, close, clearAfterSave };
}
