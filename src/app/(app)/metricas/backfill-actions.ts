"use server";

import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { assertStoreAccess } from "@/lib/store-scope";
import { backfillDailyMetricsForStore } from "@/lib/daily-metrics-snapshot";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";

export type BackfillActionState = {
  ok?: boolean;
  error?: string;
  created?: number;
  exists?: number;
  daysProcessed?: number;
};

const ROLES_EDIT = ["owner", "admin", "editor"];

export async function backfillDailyMetricsAction(
  storeId: string,
  maxDays = 60,
): Promise<BackfillActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }
  if (!mongoose.isValidObjectId(storeId)) {
    return { error: "Loja inválida." };
  }
  assertStoreAccess(user.storeAccess, storeId);

  try {
    const res = await backfillDailyMetricsForStore(storeId, { maxDays });
    invalidateWorkspaceMetricsCache(user.workspaceId);
    revalidatePath("/metricas");
    revalidatePath("/dashboard");
    return {
      ok: true,
      created: res.created,
      exists: res.exists,
      daysProcessed: res.daysProcessed,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha no backfill.",
    };
  }
}
