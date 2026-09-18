import { getStatusTone } from '../../constants/inverters';

type Props = {
  label: string;
  status?: string | null;
};

export function StatusIndicator({ label, status }: Props) {
  const tone = getStatusTone(status);
  return (
    <span className={`ui-badge ui-badge-${tone}`}>
      <i className={`status-dot ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}
