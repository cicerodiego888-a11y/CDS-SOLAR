import type { ReactNode } from 'react';
import type { NavIcon } from '../../constants/navigation';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {children}
    </svg>
  );
}

export function NavGlyph({ name }: { name: NavIcon }) {
  switch (name) {
    case 'panel':
      return <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>;
    case 'monitor':
      return <Icon><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Icon>;
    case 'operation':
      return <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" /></Icon>;
    case 'energy':
      return <Icon><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></Icon>;
    case 'plant':
      return <Icon><path d="M4 20h16M6 20V10l6-5 6 5v10" /><path d="M10 20v-6h4v6" /></Icon>;
    case 'equipment':
      return <Icon><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /></Icon>;
    case 'inverter':
      return <Icon><path d="M4 8h16v10H4z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /><path d="M9 13h6" /></Icon>;
    case 'alert':
      return <Icon><path d="M12 4 3 19h18L12 4z" /><path d="M12 10v4M12 16h.01" /></Icon>;
    case 'customers':
      return <Icon><circle cx="9" cy="8" r="3" /><path d="M3 19c.5-3 3-5 6-5s5.5 2 6 5" /><circle cx="17" cy="9" r="2.2" /><path d="M16.5 19c.3-1.6 1.4-3 3.5-3.6" /></Icon>;
    case 'grid':
      return <Icon><path d="M3 12h18M12 3v18" /><circle cx="12" cy="12" r="8" /></Icon>;
    case 'users':
      return <Icon><circle cx="8" cy="8" r="3" /><circle cx="16" cy="9" r="2.5" /><path d="M2.5 19c.6-3 3-5 5.5-5s5 2 5.5 5M14 19c.3-2 1.6-3.4 3.8-4" /></Icon>;
    case 'unit':
      return <Icon><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M4 12h16" /></Icon>;
    case 'report':
      return <Icon><path d="M7 4h8l5 5v11H7z" /><path d="M15 4v5h5M10 13h6M10 17h4" /></Icon>;
    default:
      return <Icon><circle cx="12" cy="12" r="3" /><path d="M5 12h2M17 12h2M12 5v2M12 17v2" /></Icon>;
  }
}
