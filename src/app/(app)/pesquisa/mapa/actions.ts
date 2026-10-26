"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import {
  ensureCompany,
  purgeNonShopifyJunk,
  runCompetitorDiscovery,
} from "@/lib/competitor-ads/discovery";
import {
  isNoiseLegalName,
  isPlausibleStoreHost,
  normalizeHost,
} from "@/lib/competitor-ads/normalize";
import { connectToDatabase } from "@/lib/db";
import { CompetitorCompany } from "@/models/CompetitorCompany";
import mongoose from "mongoose";

export type CompetitorActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  runId?: string;
};

const ROLES_EDIT = ["owner", "admin", "editor"];

export async function addCompetitorCompanyAction(
  _prev: CompetitorActionState,
  formData: FormData,
): Promise<CompetitorActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const parsed = z
    .object({
      legalName: z.string().trim().min(2).max(200),
      seedHosts: z.string().optional(),
      notes: z.string().optional(),
    })
    .safeParse({
      legalName: formData.get("legalName"),
      seedHosts: formData.get("seedHosts") ?? "",
      notes: formData.get("notes") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (isNoiseLegalName(parsed.data.legalName)) {
    return { error: "Esse nome não é uma empresa ecom válida." };
  }

  const seeds = String(parsed.data.seedHosts ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeHost)
    .filter(isPlausibleStoreHost);

  try {
    const company = await ensureCompany(
      user.workspaceId,
      parsed.data.legalName,
      {
        notes: parsed.data.notes?.trim() ?? "",
        seedHosts: seeds,
      },
    );
    if (!company) {
      return { error: "Não foi possível criar a empresa." };
    }

    // Seeds ficam na empresa; a verificação Shopify corre no Scan
    // (evita timeouts / falhas no “Guardar”).
    revalidatePath("/pesquisa/mapa");
    return {
      ok: true,
      message: `Empresa «${company.legalName}» adicionada${
        seeds.length ? ` com ${seeds.length} seed(s)` : ""
      }. Corre Scan para descobrir lojas Shopify.`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao guardar.",
    };
  }
}

export async function scanCompetitorsAction(
  _prev: CompetitorActionState,
  formData: FormData,
): Promise<CompetitorActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (roleRank(user.role) < roleRank("editor")) {
    return { error: "Sem permissão." };
  }

  const companyId = String(formData.get("companyId") ?? "").trim() || undefined;

  try {
    const result = await runCompetitorDiscovery(user.workspaceId, {
      trigger: "manual",
      companyId,
      maxDepth: 2,
      maxDomains: 50,
    });
    revalidatePath("/pesquisa/mapa");
    const lastInfo = [...result.events]
      .reverse()
      .find((e) => e.kind === "info" && e.message.includes("Transparency"));
    const tip =
      result.newDomains === 0 && result.domainsScanned === 0
        ? " Sem lojas novas — adiciona um domain seed Shopify e tenta outra vez."
        : "";
    return {
      ok: true,
      runId: result.runId,
      message: `Scan OK: +${result.newCompanies} empresas, +${result.newDomains} lojas Shopify, ${result.domainsScanned} analisadas.${
        lastInfo ? ` ${lastInfo.message}.` : ""
      }${tip}`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha no scan.",
    };
  }
}

/** Soft-delete imediato de domains não-Shopify / CDNs / empresas lixo. */
export async function purgeCompetitorJunkAction(): Promise<CompetitorActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) return { error: "Sem permissão." };

  try {
    const result = await purgeNonShopifyJunk(user.workspaceId);
    revalidatePath("/pesquisa/mapa");
    return {
      ok: true,
      message: `Limpeza: −${result.removedDomains} domains lixo, −${result.removedCompanies} empresas.`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha na limpeza.",
    };
  }
}

export async function softDeleteCompetitorCompanyAction(
  companyId: string,
): Promise<CompetitorActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) return { error: "Sem permissão." };
  if (!mongoose.isValidObjectId(companyId)) return { error: "ID inválido." };

  await connectToDatabase();
  await CompetitorCompany.updateOne(
    {
      _id: companyId,
      workspaceId: user.workspaceId,
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );
  revalidatePath("/pesquisa/mapa");
  return { ok: true, message: "Empresa removida." };
}
