import type { ReactNode } from 'react';

type Props = {
  title: string;
  description: string;
  icon?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon = '☀', action }: Props) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
