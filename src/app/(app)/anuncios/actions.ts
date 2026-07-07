"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Workspace } from "@/models/Workspace";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { parseDateInput } from "@/lib/period";
import { resolveAdSpendRange } from "@/lib/ad-spend";
import { AD_INPUT_CURRENCIES, isAdInputCurrency } from "@/lib/ad-currencies";
import { findStoreForUser } from "@/lib/store-scope";
import { parsePlatformInputs, type AdPlatform } from "@/lib/ad-spend-platforms";
import { buildAdSpendDayFromLines, buildZeroAdSpendDay, summarizeAdSpendLines } from "@/lib/ad-spend-save";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";
import { dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone";

export type AdSpendState = {
  ok?: boolean;
  error?: string;
  /** Outro utilizador guardou primeiro — o cliente deve refrescar os dados. */
  conflict?: boolean;
};

const ROLES_EDIT = ["owner", "admin", "editor"];

const schema = z.object({
  storeId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  inputCurrency: z.enum(AD_INPUT_CURRENCIES),
  note: z.string().trim().max(500).optional(),
  /** ISO updatedAt visto pelo cliente — evita sobrescrever gravação mais recente. */
  ifMatchUpdatedAt: z.string().trim().optional(),
});

async function getBaseCurrency(workspaceId: string): Promise<string> {
  const ws = await Workspace.findById(workspaceId).select("baseCurrency").lean();
  return ws?.baseCurrency ?? "EUR";
}

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: number }).code === 11000
  );
}

export async function saveManualAdSpendAction(
  _prev: AdSpendState,
  formData: FormData,
): Promise<AdSpendState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar ad spend." };
  }

  const rawCurrency = String(formData.get("inputCurrency") ?? "USD").toUpperCase();
  const inputCurrency = isAdInputCurrency(rawCurrency) ? rawCurrency : "USD";

  const parsed = schema.safeParse({
    storeId: formData.get("storeId"),
    date: formData.get("date"),
    inputCurrency,
    note: String(formData.get("note") ?? "").trim() || undefined,
    ifMatchUpdatedAt: String(formData.get("ifMatchUpdatedAt") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, date, note, ifMatchUpdatedAt } = parsed.data;
  const explicitZero = formData.get("explicitZero") === "1";
  const platformLines = parsePlatformInputs(formData);

  if (!explicitZero && platformLines.length === 0) {
    return {
      error:
        "Indica o gasto em ads ou marca «Sem gasto (0€)» se não houve ads nesse dia.",
    };
  }

  const day = parseDateInput(date);
  if (!day) return { error: "Data inválida." };

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (day > today) {
    return { error: "Não podes registar ad spend para dias futuros." };
  }

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "importStartDate createdAt ianaTimezone",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const apiAccounts = await loadSyncAdAccountsForStore(store._id);
  const apiPlatforms = new Set(
    apiAccounts.map((a) => a.platform as AdPlatform),
  );

  if (explicitZero && date === todayKey && apiPlatforms.size > 0) {
    return {
      error:
        "Hoje o gasto das contas API sincroniza automaticamente. Só podes marcar zero em dias anteriores ou editar plataformas manuais.",
    };
  }

  const { fromKey } = resolveAdSpendRange(
    store.importStartDate,
    store.createdAt,
  );
  if (date < fromKey) {
    return {
      error: `Só podes registar ad spend a partir de ${fromKey} (data de importação da loja).`,
    };
  }

  const baseCurrency = await getBaseCurrency(user.workspaceId);

  const manualPlatformLines =
    date === todayKey && apiPlatforms.size > 0
      ? platformLines.filter((l) => !apiPlatforms.has(l.platform))
      : platformLines;

  let built;
  try {
    if (explicitZero) {
      built = buildZeroAdSpendDay(parsed.data.inputCurrency, baseCurrency);
    } else {
      const manualBuilt = await buildAdSpendDayFromLines(
        manualPlatformLines,
        parsed.data.inputCurrency,
        baseCurrency,
        date,
      );

      if (date === todayKey && apiPlatforms.size > 0) {
        const existingDoc = await ManualAdSpend.findOne({
          storeId: store._id,
          dateKey: date,
        })
          .select("lines")
          .lean();
        const apiLines = (existingDoc?.lines ?? []).filter((l) =>
          apiPlatforms.has(l.platform as AdPlatform),
        );
        if (apiLines.length > 0) {
          built = summarizeAdSpendLines([
            ...manualBuilt.lines,
            ...apiLines.map((l) => ({
              platform: l.platform as AdPlatform,
              inputAmount: Number(l.inputAmount ?? 0),
              inputCurrency: l.inputCurrency ?? "USD",
              amount: Number(l.amount ?? 0),
              fxRate: l.fxRate ?? null,
              extraFee: Number(l.extraFee ?? 0),
              inputExtraFee: l.inputExtraFee ?? null,
              agencyFeePercent: Number(l.agencyFeePercent ?? 0),
              agencyFeeAmount: Number(l.agencyFeeAmount ?? 0),
              inputAgencyFeeAmount: l.inputAgencyFeeAmount ?? null,
            })),
          ]);
        } else {
          built = manualBuilt;
        }
      } else {
        built = manualBuilt;
      }
    }
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Falha na conversão de moeda.",
    };
  }

  const payload = {
    workspaceId: user.workspaceId,
    storeId: store._id,
    dateKey: date,
    amount: built.amount,
    currency: baseCurrency,
    inputAmount: built.inputAmount,
    inputCurrency: built.inputCurrency,
    fxRate: built.fxRate,
    extraFee: built.extraFee,
    inputExtraFee: built.inputExtraFee,
    lines: built.lines,
    note: note ?? "",
    source: "manual" as const,
    updatedBy: new mongoose.Types.ObjectId(user.id),
  };

  const existing = await ManualAdSpend.findOne({
    storeId: store._id,
    dateKey: date,
  })
    .select("updatedAt")
    .lean();

  if (existing) {
    if (!ifMatchUpdatedAt) {
      return {
        conflict: true,
        error:
          "Este dia já foi guardado por outro utilizador. Actualizámos a lista — confirma o valor antes de voltar a guardar.",
      };
    }
    const clientTs = new Date(ifMatchUpdatedAt).getTime();
    const serverTs = existing.updatedAt
      ? new Date(existing.updatedAt).getTime()
      : 0;
    if (Number.isNaN(clientTs) || clientTs !== serverTs) {
      return {
        conflict: true,
        error:
          "Alguém guardou antes de ti. Os dados foram actualizados — confirma o valor e volta a guardar se necessário.",
      };
    }

    const updated = await ManualAdSpend.findOneAndUpdate(
      {
        storeId: store._id,
        dateKey: date,
        updatedAt: existing.updatedAt,
      },
      { $set: payload },
      { new: true },
    );
    if (!updated) {
      return {
        conflict: true,
        error:
          "Alguém guardou antes de ti. Os dados foram actualizados — confirma o valor e volta a guardar se necessário.",
      };
    }
  } else {
    try {
      await ManualAdSpend.create(payload);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        return {
          conflict: true,
          error:
            "Alguém guardou antes de ti. Os dados foram actualizados — confirma o valor e volta a guardar se necessário.",
        };
      }
      throw e;
    }
  }

  revalidatePath("/anuncios");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/decisao");
  invalidateWorkspaceMetricsCache(user.workspaceId);
  return { ok: true };
}

export async function deleteManualAdSpendAction(
  _prev: AdSpendState,
  formData: FormData,
): Promise<AdSpendState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar ad spend." };
  }

  const storeId = String(formData.get("storeId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!storeId || !date) return { error: "Dados inválidos." };

  const ifMatchUpdatedAt = String(formData.get("ifMatchUpdatedAt") ?? "").trim();

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const filter: Record<string, unknown> = {
    storeId: store._id,
    dateKey: date,
  };
  if (ifMatchUpdatedAt) {
    filter.updatedAt = new Date(ifMatchUpdatedAt);
  }

  const deleted = await ManualAdSpend.deleteOne(filter);
  if (deleted.deletedCount === 0 && ifMatchUpdatedAt) {
    return {
      conflict: true,
      error:
        "O registo mudou entretanto. Actualizámos a lista — tenta novamente se ainda quiseres apagar.",
    };
  }

  revalidatePath("/anuncios");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  invalidateWorkspaceMetricsCache(user.workspaceId);
  return { ok: true };
}
