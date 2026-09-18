type Props = {
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export function TextField({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  error,
  disabled,
  onChange,
}: Props) {
  return (
    <label className={`ui-field${error ? ' is-error' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {error ? <span className="ui-field-error" id={`${id}-error`}>{error}</span> : null}
    </label>
  );
}
