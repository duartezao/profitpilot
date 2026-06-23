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
  ShieldAlert,
  Boxes,
  Bell,
  ClipboardList,
  BarChart3,
  Kanban,
  Layers,
  FlaskConical,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import type { AppViewMode } from "@/lib/app-view-mode";

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
  { label: "Chargebacks", href: "/chargebacks", icon: ShieldAlert },
  { label: "Custos", href: "/cogs", icon: Boxes },
  { label: "Relatórios", href: "/notas", icon: NotebookPen },
  { label: "Alertas", href: "/alertas", icon: Bell },
  { label: "Configurações", href: "/definicoes", icon: Settings },
];

/**
 * Modo operação — pipeline de lojas, coleções e produtos em teste.
 */
export const operationsNavItems: NavItem[] = [
  { label: "Operação", href: "/operacao", icon: Kanban },
  { label: "Tarefas", href: "/operacao/tarefas", icon: ListTodo },
  { label: "Coleções", href: "/operacao/colecoes", icon: Layers },
  { label: "Produtos teste", href: "/operacao/produtos", icon: FlaskConical },
  { label: "Lojas", href: "/lojas", icon: Store },
  { label: "Definições", href: "/definicoes", icon: Settings },
];

/** Rotas só com «Todas as lojas» (consolidado). */
export const workspaceOnlyPaths = new Set(["/lojas"]);

/** Rotas que exigem loja selecionada. */
export const storeRequiredPaths = new Set([
  "/metricas",
  "/produtos",
  "/pedidos",
  "/reembolsos",
  "/chargebacks",
]);

export function navItemsForStoreScope(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  if (viewMode === "operations") return operationsNavItems;
  return storeId ? storeNavItems : workspaceNavItems;
}

/** Item especial da barra inferior — abre o menu com o resto das páginas. */
export const MOBILE_MORE_HREF = "__more__";

export const mobileMoreNavItem: NavItem = {
  label: "Mais",
  href: MOBILE_MORE_HREF,
  icon: MoreHorizontal,
};

export function isMobileMoreNavItem(item: NavItem): boolean {
  return item.href === MOBILE_MORE_HREF;
}

/** Itens fixos na barra inferior (telemóvel). */
export function mobilePrimaryNavItems(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  if (viewMode === "operations") {
    return [
      { label: "Operação", href: "/operacao", icon: Kanban },
      { label: "Tarefas", href: "/operacao/tarefas", icon: ListTodo },
      { label: "Coleções", href: "/operacao/colecoes", icon: Layers },
      mobileMoreNavItem,
    ];
  }
  if (storeId) {
    return [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Métricas", href: "/metricas", icon: BarChart3 },
      { label: "Produtos", href: "/produtos", icon: Package },
      mobileMoreNavItem,
    ];
  }
  return [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Lojas", href: "/lojas", icon: Store },
    { label: "Decisão", href: "/decisao", icon: Scale },
    mobileMoreNavItem,
  ];
}

/** Restantes páginas da sidebar — acessíveis pelo menu «Mais». */
export function mobileOverflowNavItems(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  const all = navItemsForStoreScope(storeId, viewMode);
  const primaryHrefs = new Set(
    mobilePrimaryNavItems(storeId, viewMode)
      .filter((i) => !isMobileMoreNavItem(i))
      .map((i) => i.href),
  );
  return all.filter((i) => !primaryHrefs.has(i.href));
}

export function mobileNavForStoreScope(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  return mobilePrimaryNavItems(storeId, viewMode);
}

/** @deprecated usar mobilePrimaryNavItems */
export const mobileWorkspaceNavItems = mobilePrimaryNavItems(null);
/** @deprecated usar mobilePrimaryNavItems */
export const mobileStoreNavItems = mobilePrimaryNavItems("store");

/** @deprecated */
export const navItems = workspaceNavItems;
export const mobileNavItems = mobileWorkspaceNavItems;
