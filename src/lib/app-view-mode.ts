/** Vista principal da app — financeira (métricas/lucro) ou operacional (pipeline de testes). */

export type AppViewMode = "financial" | "operations";

export const DEFAULT_APP_VIEW_MODE: AppViewMode = "financial";

export const APP_VIEW_MODE_LABEL: Record<AppViewMode, string> = {
  financial: "Financeiro",
  operations: "Operação",
};

export const APP_VIEW_MODE_LABEL_SHORT: Record<AppViewMode, string> = {
  financial: "Fin.",
  operations: "Op.",
};

export function normalizeAppViewMode(
  raw: string | null | undefined,
): AppViewMode {
  return raw === "operations" ? "operations" : "financial";
}

export function storageKeyForAppViewMode(workspaceId: string): string {
  return `pp-app-view:${workspaceId}`;
}

/** Rotas do modo operação (pipeline de lojas/coleções/produtos). */
export const operationsPathPrefix = "/operacao";

/** Rotas válidas em ambos os modos (não forçam troca de modo). */
export const sharedAppPaths = new Set(["/lojas", "/definicoes"]);

export function isOperationsPath(pathname: string): boolean {
  return (
    pathname === operationsPathPrefix ||
    pathname.startsWith(`${operationsPathPrefix}/`)
  );
}

export function isSharedAppPath(pathname: string): boolean {
  if (sharedAppPaths.has(pathname)) return true;
  return pathname.startsWith("/definicoes/");
}

/** Páginas só do modo financeiro (métricas, lucro, etc.). */
export function isFinancialOnlyPath(pathname: string): boolean {
  return !isOperationsPath(pathname) && !isSharedAppPath(pathname);
}

export function homePathForMode(mode: AppViewMode): string {
  return mode === "operations" ? operationsPathPrefix : "/dashboard";
}

/**
 * Destino após mudar de modo, ou null para manter a rota actual.
 */
export function targetPathAfterModeSwitch(
  pathname: string,
  next: AppViewMode,
): string | null {
  if (next === "operations") {
    if (isFinancialOnlyPath(pathname)) return homePathForMode("operations");
    return null;
  }
  if (isOperationsPath(pathname)) return homePathForMode("financial");
  return null;
}

/** Modo inferido pela rota actual (null = rota partilhada, não altera preferência). */
export function modeInferredFromPath(pathname: string): AppViewMode | null {
  if (isOperationsPath(pathname)) return "operations";
  if (isFinancialOnlyPath(pathname)) return "financial";
  return null;
}
