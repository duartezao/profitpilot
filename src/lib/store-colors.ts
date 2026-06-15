/**
 * Cores por loja — paleta sóbria (sem neon), estável por índice no workspace.
 * Usada no gráfico consolidado e sparklines da tabela de lojas.
 */
export const STORE_CHART_COLORS = [
  "#2563EB",
  "#6366F1",
  "#0891B2",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#059669",
  "#CA8A04",
  "#4F46E5",
  "#0D9488",
  "#BE185D",
  "#B45309",
] as const;

export function getStoreColor(index: number): string {
  return STORE_CHART_COLORS[index % STORE_CHART_COLORS.length];
}

/** Mapa storeId → cor com ordem estável (nome, depois id). */
export function buildStoreColorMap(
  stores: Array<{ id: string; name: string }>,
): Map<string, string> {
  const sorted = [...stores].sort((a, b) => {
    const n = a.name.localeCompare(b.name, "pt");
    if (n !== 0) return n;
    return a.id.localeCompare(b.id);
  });
  return new Map(sorted.map((s, i) => [s.id, getStoreColor(i)]));
}
