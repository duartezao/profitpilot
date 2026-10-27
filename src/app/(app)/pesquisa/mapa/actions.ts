"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import {
  ensureCompany,
  ensureShopifyDomain,
  purgeNonShopifyJunk,
  runCompetitorDiscovery,
} from "@/lib/competitor-ads/discovery";
import {
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
  companyId?: string;
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
        exactName: true,
      },
    );
    if (!company?._id) {
      return { error: "Não foi possível criar a empresa." };
    }

    revalidatePath("/pesquisa/mapa");
    revalidatePath("/pesquisa");
    return {
      ok: true,
      companyId: String(company._id),
      message: `«${company.legalName}» adicionada`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao guardar.";
    // Unique index → mensagem clara
    if (/E11000|duplicate/i.test(msg)) {
      return { error: "Já existe uma empresa com este nome." };
    }
    return { error: msg };
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
    // Limpa cooldown antigo se já passou / permite retry manual
    const { clearTransparencyGate, getTransparencyGateStatus } = await import(
      "@/lib/competitor-ads/transparency-gate"
    );
    const status = await getTransparencyGateStatus();
    if (
      status.blockedUntil &&
      new Date(status.blockedUntil).getTime() <= Date.now()
    ) {
      await clearTransparencyGate();
    }

    const result = await runCompetitorDiscovery(user.workspaceId, {
      trigger: "manual",
      companyId,
      maxDepth: 3,
      // Sem limite prático de lojas irmãs
      maxDomains: 10_000,
      includeAds: true,
    });
    revalidatePath("/pesquisa/mapa");
    const parts = [
      `+${result.newCompanies} empresas`,
      `+${result.newDomains} lojas`,
      `${result.domainsScanned} analisadas`,
    ];
    return {
      ok: true,
      runId: result.runId,
      message: parts.join(" · "),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha no scan.",
    };
  }
}

/** Cola domains descobertos no browser (Transparency) — sem bater no Google no servidor. */
export async function importCompetitorHostsAction(
  _prev: CompetitorActionState,
  formData: FormData,
): Promise<CompetitorActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) return { error: "Sem permissão." };

  const companyId = String(formData.get("companyId") ?? "").trim();
  const raw = String(formData.get("hosts") ?? "");
  if (!mongoose.isValidObjectId(companyId)) return { error: "Empresa inválida." };

  const hosts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeHost)
    .filter(isPlausibleStoreHost);

  if (!hosts.length) {
    return { error: "Cola pelo menos um domain Shopify válido." };
  }

  await connectToDatabase();
  const company = await CompetitorCompany.findOne({
    _id: companyId,
    workspaceId: user.workspaceId,
    deletedAt: null,
  });
  if (!company) return { error: "Empresa não encontrada." };

  await CompetitorCompany.updateOne(
    { _id: company._id },
    { $addToSet: { seedHosts: { $each: hosts } } },
  );

  let added = 0;
  let skipped = 0;
  for (const host of hosts.slice(0, 40)) {
    const d = await ensureShopifyDomain(user.workspaceId, host, {
      companyId: company._id,
      discoverySource: "manual",
    });
    if (d) added++;
    else skipped++;
  }

  revalidatePath("/pesquisa/mapa");
  return {
    ok: true,
    message: `Import: ${added} lojas Shopify, ${skipped} ignoradas (não Shopify / bloqueadas).`,
  };
}

export async function getTransparencyStatusAction(): Promise<{
  enabled: boolean;
  allowed: boolean;
  blockedUntil: string | null;
  reason: string | null;
  provider?: string;
}> {
  const { getTransparencyGateStatus } = await import(
    "@/lib/competitor-ads/transparency-gate"
  );
  return getTransparencyGateStatus();
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
      message: `−${result.removedDomains} domains · −${result.removedCompanies} empresas`,
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
