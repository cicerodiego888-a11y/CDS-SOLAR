type Option = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  value?: string;
  options: Option[];
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  name?: string;
  onChange?: (value: string) => void;
};

export function SelectField({
  id,
  label,
  value,
  options,
  placeholder = 'Selecione',
  error,
  hint,
  disabled,
  name,
  onChange,
}: Props) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const empty = !value;

  return (
    <label className={`ui-field${error ? ' is-error' : ''}`} htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <select
        id={id}
        name={name ?? id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={empty ? 'is-placeholder' : undefined}
        data-placeholder={empty ? 'true' : undefined}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error ? <span className="ui-field-hint" id={`${id}-hint`}>{hint}</span> : null}
      {error ? <span className="ui-field-error" id={`${id}-error`}>{error}</span> : null}
    </label>
  );
}
