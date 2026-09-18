export const APP_NAME = 'B7 Solar';
export const APP_PRODUCT = 'B7 Solar — Plataforma de Gestão';

export const NAV_ITEMS = [
  { href: '/', label: 'Painel', permission: 'DASHBOARD_VIEW', group: 'Operação', icon: 'panel' },
  { href: '/monitoramento', label: 'Monitoramento', permission: 'MONITORING_VIEW', group: 'Operação', icon: 'monitor' },
  { href: '/operacao', label: 'Operação', permission: 'MONITORING_VIEW', group: 'Operação', icon: 'operation' },
  { href: '/usinas', label: 'Usinas', permission: 'PLANTS_VIEW', group: 'Ativos', icon: 'plant' },
  { href: '/equipamentos', label: 'Equipamentos', permission: 'EQUIPMENT_VIEW', group: 'Ativos', icon: 'equipment' },
  { href: '/inversores', label: 'Inversores', permission: 'INVERTERS_VIEW', group: 'Ativos', icon: 'inverter' },
  { href: '/alertas', label: 'Alertas', permission: 'ALERTS_VIEW', group: 'Eventos', icon: 'alert' },
  { href: '/clientes', label: 'Clientes', permission: 'CUSTOMERS_VIEW', group: 'Cadastros', icon: 'customers' },
  { href: '/distribuidoras', label: 'Distribuidoras', permission: 'DISTRIBUTORS_VIEW', group: 'Cadastros', icon: 'grid' },
  { href: '/consumidores', label: 'Consumidores', permission: 'CONSUMERS_VIEW', group: 'Cadastros', icon: 'users' },
  { href: '/unidades-consumidoras', label: 'Unidades Consumidoras', permission: 'CONSUMER_UNITS_VIEW', group: 'Cadastros', icon: 'unit' },
  { href: '/relatorios', label: 'Relatórios', permission: 'REPORTS_VIEW', group: 'Sistema', icon: 'report' },
  { href: '/configuracoes', label: 'Configurações', permission: 'SETTINGS_VIEW', group: 'Sistema', icon: 'settings' },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]['icon'];
