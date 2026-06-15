const PORTFOLIO_STORAGE_PREFIX = "pp-portfolio-scope:";

export function parsePortfolioParam(
  raw: string | null | undefined,
): string[] | "all" | null {
  if (!raw?.trim()) return null;
  if (raw === "all") return "all";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return ids.length ? ids : null;
}

export function portfolioParamFromIds(ids: string[] | "all" | null): string | null {
  if (!ids) return null;
  if (ids === "all") return "all";
  return ids.length ? ids.join(",") : null;
}

export function persistPortfolioScope(
  userId: string,
  portfolio: string | null,
) {
  if (typeof window === "undefined") return;
  const key = `${PORTFOLIO_STORAGE_PREFIX}${userId}`;
  if (!portfolio) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, portfolio);
}

export function getPersistedPortfolioScope(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(`${PORTFOLIO_STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}
