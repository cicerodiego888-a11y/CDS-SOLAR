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
        <div className="topbar">
          <form className="search" onSubmit={onSearch} role="search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar usinas, clientes ou equipamentos..."
              aria-label="Buscar usinas, clientes ou equipamentos"
            />
          </form>
          <div className="topbar-actions">
            <button type="button" className="icon-btn" aria-label="Notificações">
              <span aria-hidden="true">●</span>
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
            <span className="status" title={APP_PRODUCT}>Sistema operacional</span>
          </div>
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
