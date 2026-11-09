'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME, APP_PRODUCT, NAV_ITEMS } from '../../constants/navigation';
import { can } from '../../lib/operational';
import { NavGlyph } from './NavGlyph';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const initials = user?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B7';

  const groups = useMemo(() => {
    const visible = NAV_ITEMS.filter((item) => can(user, item.permission));
    const result: Array<{ group: string; items: typeof visible }> = [];
    visible.forEach((item) => {
      const last = result[result.length - 1];
      if (!last || last.group !== item.group) result.push({ group: item.group, items: [item] });
      else last.items.push(item);
    });
    return result;
  }, [user]);

  /** Busca visual do topbar — sem fluxo global (comportamento preservado). */
  function onSearch(event: FormEvent) {
    event.preventDefault();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B7</span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>Plataforma de Gestão</small>
          </div>
        </div>
        <nav aria-label="Principal">
          {groups.map((group) => (
            <div key={group.group} className="nav-group">
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? 'nav-link active' : 'nav-link'}
                    aria-current={active ? 'page' : undefined}
                  >
                    <NavGlyph name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <strong>B7 Solar</strong>
          <span>Energia, operação e inteligência</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <form className="search" onSubmit={onSearch} role="search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar usinas, clientes ou equipamentos..."
              aria-label="Buscar usinas, clientes ou equipamentos"
              autoComplete="off"
            />
          </form>
          <div className="topbar-actions">
            <button type="button" className="icon-btn" aria-label="Notificações" title="Notificações">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
            </button>
            <div className="user-chip">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <div>
                <strong>{user?.name}</strong>
                <small>{user?.profileLabel}</small>
              </div>
            </div>
            <button type="button" className="ui-button ui-button-secondary" onClick={logout}>
              Sair
            </button>
            <span
              className="shell-system-chip"
              title={APP_PRODUCT}
              aria-label={`${APP_PRODUCT} — rótulo estático do produto`}
            >
              Sistema operacional
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
