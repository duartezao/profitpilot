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

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Visão consolidada (todas as lojas). */
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

/** Vista por loja — mesmos nomes que no consolidado quando a rota é igual. */
export const storeNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Métricas", href: "/metricas", icon: BarChart3 },
  { label: "Lucro & Finanças", href: "/financas", icon: LineChart },
  { label: "Decisão", href: "/decisao", icon: Scale },
  { label: "Produtos", href: "/produtos", icon: Package },
  { label: "Pedidos", href: "/pedidos", icon: ShoppingBag },
  { label: "Anúncios", href: "/anuncios", icon: Megaphone },
  { label: "Payouts", href: "/payouts", icon: Banknote },
  { label: "Reembolsos", href: "/reembolsos", icon: RotateCcw },
  { label: "Chargebacks", href: "/chargebacks", icon: ShieldAlert },
  { label: "Custos", href: "/cogs", icon: Boxes },
  { label: "Notas", href: "/notas", icon: NotebookPen },
  { label: "Alertas", href: "/alertas", icon: Bell },
  { label: "Definições", href: "/definicoes", icon: Settings },
];

export const operationsNavItems: NavItem[] = [
  { label: "Hoje", href: "/operacao", icon: Kanban },
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
  "/alertas",
]);

export function navItemsForStoreScope(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  if (viewMode === "operations") return operationsNavItems;
  return storeId ? storeNavItems : workspaceNavItems;
}

/** Sidebar agrupada — mais fácil de escanear. */
export function navGroupsForStoreScope(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavGroup[] {
  if (viewMode === "operations") {
    return [{ label: "", items: operationsNavItems }];
  }
  if (!storeId) {
    return [{ label: "", items: workspaceNavItems }];
  }
  const pick = (...hrefs: string[]) =>
    storeNavItems.filter((i) => hrefs.includes(i.href));
  return [
    {
      label: "Resumo",
      items: pick("/dashboard", "/metricas", "/financas", "/decisao"),
    },
    {
      label: "Operação",
      items: pick(
        "/produtos",
        "/pedidos",
        "/anuncios",
        "/payouts",
        "/reembolsos",
        "/chargebacks",
        "/cogs",
      ),
    },
    {
      label: "Relatórios",
      items: pick("/notas", "/alertas"),
    },
    {
      label: "Conta",
      items: pick("/definicoes"),
    },
  ].filter((g) => g.items.length > 0);
}

/** Mantém a rota ao mudar de loja quando faz sentido. */
export function pathAllowedForStoreScope(
  pathname: string,
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): boolean {
  if (viewMode === "operations") {
    return operationsNavItems.some(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
    );
  }
  if (storeId && workspaceOnlyPaths.has(pathname)) return false;
  if (!storeId && storeRequiredPaths.has(pathname)) return false;
  const items = navItemsForStoreScope(storeId, viewMode);
  return items.some(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
}

export const MOBILE_MORE_HREF = "__more__";

export const mobileMoreNavItem: NavItem = {
  label: "Mais",
  href: MOBILE_MORE_HREF,
  icon: MoreHorizontal,
};

export function isMobileMoreNavItem(item: NavItem): boolean {
  return item.href === MOBILE_MORE_HREF;
}

/** Barra inferior — prioridade às tarefas diárias. */
export function mobilePrimaryNavItems(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavItem[] {
  if (viewMode === "operations") {
    return [
      { label: "Hoje", href: "/operacao", icon: Kanban },
      { label: "Tarefas", href: "/operacao/tarefas", icon: ListTodo },
      { label: "Coleções", href: "/operacao/colecoes", icon: Layers },
      mobileMoreNavItem,
    ];
  }
  if (storeId) {
    return [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Anúncios", href: "/anuncios", icon: Megaphone },
      { label: "Decisão", href: "/decisao", icon: Scale },
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

/** Secções do menu «Mais» (mobile). */
export function mobileOverflowNavGroups(
  storeId: string | null,
  viewMode: AppViewMode = "financial",
): NavGroup[] {
  const overflow = new Set(
    mobileOverflowNavItems(storeId, viewMode).map((i) => i.href),
  );
  return navGroupsForStoreScope(storeId, viewMode)
    .map((g) => ({
      label: g.label,
      items: g.items.filter((i) => overflow.has(i.href)),
    }))
    .filter((g) => g.items.length > 0);
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
