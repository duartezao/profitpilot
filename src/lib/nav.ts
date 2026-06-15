import {
  LayoutDashboard,
  Store,
  LineChart,
  Banknote,
  Scale,
  NotebookPen,
  Megaphone,
  Settings,
  MoreHorizontal,
  Package,
  ShoppingBag,
  RotateCcw,
  Boxes,
  Bell,
  ClipboardList,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Visão consolidada — mockup `assets/mockup-dashboard-consolidado.png`
 * Sidebar: Dashboard, Lojas, Lucro & Finanças, Payouts, Decisão, Notas, Anúncios, Definições
 */
export const workspaceNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Lojas", href: "/lojas", icon: Store },
  { label: "Lucro & Finanças", href: "/financas", icon: LineChart },
  { label: "Payouts", href: "/payouts", icon: Banknote },
  { label: "Decisão", href: "/decisao", icon: Scale },
  { label: "Notas", href: "/notas", icon: NotebookPen },
  { label: "Anúncios", href: "/anuncios", icon: Megaphone },
  { label: "Definições", href: "/definicoes", icon: Settings },
];

/**
 * Vista por loja — mockup `assets/mockup-dashboard-loja.png`
 * Sidebar: Dashboard, Métricas, Resumo, Produtos, Pedidos, Payouts, Anúncios, Reembolsos, Custos, Relatórios, Alertas, Configurações
 */
export const storeNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Métricas", href: "/metricas", icon: BarChart3 },
  { label: "Resumo", href: "/financas", icon: ClipboardList },
  { label: "Produtos", href: "/produtos", icon: Package },
  { label: "Pedidos", href: "/pedidos", icon: ShoppingBag },
  { label: "Payouts", href: "/payouts", icon: Banknote },
  { label: "Anúncios", href: "/anuncios", icon: Megaphone },
  { label: "Reembolsos", href: "/reembolsos", icon: RotateCcw },
  { label: "Custos", href: "/cogs", icon: Boxes },
  { label: "Relatórios", href: "/notas", icon: NotebookPen },
  { label: "Alertas", href: "/alertas", icon: Bell },
  { label: "Configurações", href: "/definicoes", icon: Settings },
];

/** Rotas só com «Todas as lojas» (consolidado). */
export const workspaceOnlyPaths = new Set(["/lojas"]);

/** Rotas que exigem loja selecionada. */
export const storeRequiredPaths = new Set([
  "/metricas",
  "/produtos",
  "/pedidos",
  "/reembolsos",
]);

export function navItemsForStoreScope(storeId: string | null): NavItem[] {
  return storeId ? storeNavItems : workspaceNavItems;
}

/** Mobile — consolidado (mockup PWA). */
export const mobileWorkspaceNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Lojas", href: "/lojas", icon: Store },
  { label: "Decisão", href: "/decisao", icon: Scale },
  { label: "Mais", href: "/definicoes", icon: MoreHorizontal },
];

/** Mobile — loja selecionada. */
export const mobileStoreNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Métricas", href: "/metricas", icon: BarChart3 },
  { label: "Produtos", href: "/produtos", icon: Package },
  { label: "Payouts", href: "/payouts", icon: Banknote },
];

export function mobileNavForStoreScope(storeId: string | null): NavItem[] {
  return storeId ? mobileStoreNavItems : mobileWorkspaceNavItems;
}

/** @deprecated */
export const navItems = workspaceNavItems;
export const mobileNavItems = mobileWorkspaceNavItems;
