import mongoose from "mongoose";

export type StoreAccess = "all" | string[];

export function normalizeStoreAccess(value: unknown): StoreAccess {
  if (value === "all") return "all";
  if (Array.isArray(value)) {
    const ids = value.map(String).filter((id) => mongoose.isValidObjectId(id));
    return ids.length ? ids : [];
  }
  return "all";
}

export function canAccessStore(
  storeAccess: StoreAccess,
  storeId: string,
): boolean {
  if (storeAccess === "all") return true;
  return storeAccess.includes(storeId);
}

/** Filtro MongoDB extra para `Store.find` (null = sem restrição). */
export function storeAccessMongoFilter(
  storeAccess: StoreAccess,
): Record<string, unknown> | null {
  if (storeAccess === "all") return null;
  if (!storeAccess.length) {
    return { _id: { $in: [] } };
  }
  return {
    _id: {
      $in: storeAccess.map((id) => new mongoose.Types.ObjectId(id)),
    },
  };
}

export function storeAccessLabel(
  storeAccess: StoreAccess,
  storeCount?: number,
): string {
  if (storeAccess === "all") {
    return "Todas as lojas (inclui novas)";
  }
  const n = storeAccess.length;
  if (n === 0) return "Nenhuma loja";
  if (storeCount != null && n >= storeCount) return "Todas as lojas";
  return n === 1 ? "1 loja" : `${n} lojas`;
}

export function parseStoreIdsFromForm(raw: FormDataEntryValue | null): string[] {
  if (!raw || typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((id) => mongoose.isValidObjectId(id)),
    ),
  ];
}
