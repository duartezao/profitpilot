export type CogsCsvRow = {
  variantId: string;
  cost: number;
  title?: string;
};

export type CogsCsvParseResult = {
  rows: CogsCsvRow[];
  errors: string[];
};

function parseCost(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function detectColumns(header: string[]): {
  variantIdx: number;
  costIdx: number;
  titleIdx: number;
} | null {
  const lower = header.map((h) => h.trim().toLowerCase());
  const variantIdx = lower.findIndex((h) =>
    ["variant_id", "variantid", "variant", "sku"].includes(h),
  );
  const costIdx = lower.findIndex((h) =>
    ["cost", "custo", "unit_cost", "unitcost"].includes(h),
  );
  const titleIdx = lower.findIndex((h) =>
    ["title", "product", "produto", "name", "nome"].includes(h),
  );
  if (variantIdx < 0 || costIdx < 0) return null;
  return { variantIdx, costIdx, titleIdx };
}

/** CSV: variant_id,cost[,title] — separador vírgula ou ponto-e-vírgula */
export function parseCogsCsv(text: string): CogsCsvParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: ["Ficheiro vazio."] };
  }

  const sep = lines[0].includes(";") ? ";" : ",";
  const firstCells = lines[0].split(sep).map((c) => c.trim());
  const cols = detectColumns(firstCells);
  const startIdx = cols ? 1 : 0;
  const variantIdx = cols?.variantIdx ?? 0;
  const costIdx = cols?.costIdx ?? 1;
  const titleIdx = cols?.titleIdx ?? -1;

  const rows: CogsCsvRow[] = [];
  const seen = new Set<string>();

  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const variantId = cells[variantIdx]?.trim();
    const cost = parseCost(cells[costIdx] ?? "");
    if (!variantId) {
      errors.push(`Linha ${i + 1}: variant_id em falta.`);
      continue;
    }
    if (cost == null) {
      errors.push(`Linha ${i + 1}: custo inválido.`);
      continue;
    }
    if (seen.has(variantId)) continue;
    seen.add(variantId);
    rows.push({
      variantId,
      cost,
      title: titleIdx >= 0 ? cells[titleIdx]?.trim() || undefined : undefined,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("Nenhuma linha válida encontrada.");
  }

  return { rows, errors };
}
