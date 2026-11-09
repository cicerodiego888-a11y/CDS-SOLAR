import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
