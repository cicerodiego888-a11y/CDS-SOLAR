type Props = {
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  name?: string;
  autoComplete?: string;
  onChange?: (value: string) => void;
};

export function TextField({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  error,
  hint,
  disabled,
  name,
  autoComplete,
  onChange,
}: Props) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <label className={`ui-field${error ? ' is-error' : ''}`} htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <input
        id={id}
        name={name ?? id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {hint && !error ? <span className="ui-field-hint" id={`${id}-hint`}>{hint}</span> : null}
      {error ? <span className="ui-field-error" id={`${id}-error`}>{error}</span> : null}
    </label>
  );
}
