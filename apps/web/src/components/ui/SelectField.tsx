type Option = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  value?: string;
  options: Option[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export function SelectField({
  id,
  label,
  value,
  options,
  placeholder = 'Selecione',
  error,
  disabled,
  onChange,
}: Props) {
  return (
    <label className={`ui-field${error ? ' is-error' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="ui-field-error">{error}</span> : null}
    </label>
  );
}
