import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CompetitorCompany } from "@/models/CompetitorCompany";
import { CompetitorDomain } from "@/models/CompetitorDomain";
import { CompetitorLink } from "@/models/CompetitorLink";
import { CompetitorAdSnapshot } from "@/models/CompetitorAdSnapshot";
import { CompetitorDiscoveryRun } from "@/models/CompetitorDiscoveryRun";
import { crawlImpressum } from "./impressum";
import {
  searchTransparencyByAdvertiser,
  searchTransparencyByDomain,
} from "./transparency";
import {
  assertTransparencyAllowed,
  isTransparencyEnabledByEnv,
} from "./transparency-gate";
import {
  countryFromTld,
  extractCanonicalLegalName,
  isNoiseLegalName,
  isPlausibleStoreHost,
  normalizeHost,
  normalizeLegalName,
  todayKey,
} from "./normalize";

type WsId = mongoose.Types.ObjectId | string;

function oid(id: WsId) {
  return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

async function upsertLink(
  workspaceId: mongoose.Types.ObjectId,
  fromType: "company" | "domain",
  fromId: mongoose.Types.ObjectId,
  toType: "company" | "domain",
  toId: mongoose.Types.ObjectId,
  kind: "same_legal" | "same_advertiser" | "ads_landing" | "seed",
  meta: Record<string, unknown> = {},
) {
  await CompetitorLink.updateOne(
    { workspaceId, fromType, fromId, toType, toId, kind },
    { $set: { score: 1, meta } },
    { upsert: true },
  );
}

export async function ensureCompany(
  workspaceId: WsId,
  legalName: string,
  opts?: {
    entityId?: string | null;
    registryCountry?: string | null;
    notes?: string;
    seedHosts?: string[];
    /** Manual: grava o nome exacto (sem extractCanonical). */
    exactName?: boolean;
  },
) {
  const trimmed = legalName.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  let displayName: string;
  if (opts?.exactName) {
    displayName = trimmed;
  } else {
    const canonical = extractCanonicalLegalName(trimmed);
    if (!canonical || isNoiseLegalName(canonical)) return null;
    displayName = canonical;
  }

  await connectToDatabase();
  const ws = oid(workspaceId);
  const key = normalizeLegalName(displayName);

  // Revive soft-delete ou actualiza activo (evita falha de unique / null do upsert)
  const existing = await CompetitorCompany.findOne({
    workspaceId: ws,
    legalNameKey: key,
  });

  if (existing) {
    const seedHosts = opts?.seedHosts?.length
      ? [
          ...new Set([
            ...(existing.seedHosts ?? []),
            ...opts.seedHosts.map(normalizeHost),
          ]),
        ]
      : existing.seedHosts ?? [];
    await CompetitorCompany.updateOne(
      { _id: existing._id },
      {
        $set: {
          legalName: displayName,
          legalNameKey: key,
          seedHosts,
          ...(opts?.entityId ? { entityId: opts.entityId } : {}),
          ...(opts?.registryCountry
            ? { registryCountry: opts.registryCountry }
            : {}),
          ...(opts?.notes != null ? { notes: opts.notes } : {}),
        },
        $unset: { deletedAt: "" },
      },
    );
    return CompetitorCompany.findById(existing._id);
  }

  try {
    return await CompetitorCompany.create({
      workspaceId: ws,
      legalName: displayName,
      legalNameKey: key,
      entityId: opts?.entityId ?? null,
      registryCountry: opts?.registryCountry ?? null,
      notes: opts?.notes ?? "",
      seedHosts: (opts?.seedHosts ?? []).map(normalizeHost),
    });
  } catch (e) {
    // Corrida de unique: ler o doc criado
    const again = await CompetitorCompany.findOne({
      workspaceId: ws,
      legalNameKey: key,
      deletedAt: null,
    });
    if (again) return again;
    throw e;
  }
}

/**
 * Só persiste storefronts Shopify.
 * Devolve null se host bloqueado / não Shopify.
 */
export async function ensureShopifyDomain(
  workspaceId: WsId,
  hostInput: string,
  opts?: {
    companyId?: mongoose.Types.ObjectId | null;
    discoverySource?: "seed" | "impressum" | "transparency" | "manual" | "loop";
    /** Se true, grava seed mesmo antes do crawl (é verificado no scan). */
    allowUnverifiedSeed?: boolean;
  },
) {
  await connectToDatabase();
  const ws = oid(workspaceId);
  const host = normalizeHost(hostInput);
  if (!isPlausibleStoreHost(host)) return null;

  // Nunca tratar as tuas lojas Shopify como competitor
  const { Store } = await import("@/models/Store");
  const own = await Store.findOne({
    workspaceId: ws,
    deletedAt: null,
    displayUrl: host,
  })
    .select("_id")
    .lean();
  if (own) return null;

  const impressum = await crawlImpressum(host);
  // null = crawl falhou — não marcar como lixo nem soft-delete
  if (impressum.isShopify !== true) {
    if (impressum.isShopify === false) {
      await CompetitorDomain.updateOne(
        { workspaceId: ws, host, deletedAt: null, isShopify: { $ne: true } },
        { $set: { deletedAt: new Date(), isShopify: false, isActive: false } },
      );
    }
    return null;
  }

  const country = impressum.country ?? countryFromTld(host);
  const doc = await CompetitorDomain.findOneAndUpdate(
    { workspaceId: ws, host, deletedAt: null },
    {
      $setOnInsert: {
        workspaceId: ws,
        host,
        firstSeenAt: new Date(),
        discoverySource: opts?.discoverySource ?? "manual",
      },
      $set: {
        lastSeenAt: new Date(),
        isShopify: true,
        isActive: true,
        brandName: impressum.brandName,
        ...(opts?.companyId !== undefined
          ? { companyId: opts.companyId }
          : {}),
        ...(country ? { country } : {}),
      },
      $unset: { deletedAt: 1 },
    },
    { upsert: true, returnDocument: "after" },
  );
  return doc;
}

/** @deprecated usar ensureShopifyDomain — mantido só para seeds pendentes. */
export async function ensureDomain(
  workspaceId: WsId,
  hostInput: string,
  opts?: {
    companyId?: mongoose.Types.ObjectId | null;
    brandName?: string | null;
    country?: string | null;
    isShopify?: boolean | null;
    discoverySource?: "seed" | "impressum" | "transparency" | "manual" | "loop";
  },
) {
  return ensureShopifyDomain(workspaceId, hostInput, {
    companyId: opts?.companyId,
    discoverySource: opts?.discoverySource,
  });
}

/** Apaga domains que não são Shopify + empresas lixo (Google, etc.). */
export async function purgeNonShopifyJunk(workspaceId: WsId) {
  await connectToDatabase();
  const ws = oid(workspaceId);
  const domains = await CompetitorDomain.find({
    workspaceId: ws,
    deletedAt: null,
  })
    .select("_id host isShopify")
    .lean();

  let removedDomains = 0;
  for (const d of domains) {
    // Host bloqueado / CDN / não-Shopify confirmado → fora
    if (!isPlausibleStoreHost(d.host) || d.isShopify === false) {
      await CompetitorDomain.updateOne(
        { _id: d._id },
        { $set: { deletedAt: new Date(), isShopify: false, isActive: false } },
      );
      removedDomains++;
      continue;
    }
    if (d.isShopify === true) continue;
    // isShopify null: confirma via crawl
    const check = await crawlImpressum(d.host);
    if (check.isShopify) {
      await CompetitorDomain.updateOne(
        { _id: d._id },
        { $set: { isShopify: true } },
      );
      continue;
    }
    await CompetitorDomain.updateOne(
      { _id: d._id },
      { $set: { deletedAt: new Date(), isShopify: false, isActive: false } },
    );
    removedDomains++;
  }

  const companies = await CompetitorCompany.find({
    workspaceId: ws,
    deletedAt: null,
  })
    .select("_id legalName legalNameKey")
    .lean();
  let removedCompanies = 0;
  for (const c of companies) {
    const canonical = extractCanonicalLegalName(c.legalName);
    const junk =
      !canonical ||
      isNoiseLegalName(c.legalName) ||
      normalizeLegalName(c.legalName) !== canonical;
    if (!junk) continue;

    // Antes de apagar: mover lojas Shopify para a empresa canónica
    if (canonical) {
      const target = await ensureCompany(ws, canonical);
      if (target) {
        await CompetitorDomain.updateMany(
          { workspaceId: ws, companyId: c._id, deletedAt: null },
          { $set: { companyId: target._id } },
        );
        await refreshCompanyAggregates(ws, target._id);
      }
    }

    await CompetitorCompany.updateOne(
      { _id: c._id },
      { $set: { deletedAt: new Date() } },
    );
    removedCompanies++;
  }

  return { removedDomains, removedCompanies };
}

async function refreshCompanyAggregates(
  workspaceId: mongoose.Types.ObjectId,
  companyId: mongoose.Types.ObjectId,
) {
  const domains = await CompetitorDomain.find({
    workspaceId,
    companyId,
    deletedAt: null,
    isShopify: true,
  })
    .select("country activeAdCount")
    .lean();
  const countries = [
    ...new Set(
      domains.map((d) => d.country).filter((c): c is string => Boolean(c)),
    ),
  ].sort();
  const activeAdCount = domains.reduce(
    (s, d) => s + (d.activeAdCount ?? 0),
    0,
  );
  await CompetitorCompany.updateOne(
    { _id: companyId },
    {
      $set: {
        storeCount: domains.length,
        activeAdCount,
        countries,
      },
    },
  );
}

type RunEvent = {
  kind:
    | "company_found"
    | "domain_found"
    | "ads_updated"
    | "link_created"
    | "error"
    | "info";
  message: string;
  companyId?: mongoose.Types.ObjectId | null;
  domainId?: mongoose.Types.ObjectId | null;
  host?: string | null;
  legalName?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Loop: seeds → Transparency (auto) → Impressum → novas lojas Shopify.
 * Circuit-breaker após 429. Desligar Google: COMPETITOR_TRANSPARENCY=0.
 */
export async function runCompetitorDiscovery(
  workspaceId: WsId,
  opts?: {
    trigger?: "manual" | "cron" | "seed";
    companyId?: string;
    maxDepth?: number;
    maxDomains?: number;
    /** Default true — o Scan vai buscar lojas/ads sozinho. */
    includeAds?: boolean;
  },
) {
  await connectToDatabase();
  const ws = oid(workspaceId);
  const maxDepth = opts?.maxDepth ?? 2;
  // Sem tecto artificial de lojas irmãs — só evita reprocessar hosts já vistos.
  const maxDomains = opts?.maxDomains ?? 10_000;
  const wantAds =
    opts?.includeAds !== false && isTransparencyEnabledByEnv();

  const run = await CompetitorDiscoveryRun.create({
    workspaceId: ws,
    trigger: opts?.trigger ?? "manual",
    status: "running",
    events: [],
  });

  const events: RunEvent[] = [];
  const push = (e: RunEvent) => {
    events.push({ ...e, meta: e.meta ?? {} });
  };

  let adsAllowed = false;
  if (wantAds) {
    const gate = await assertTransparencyAllowed();
    adsAllowed = gate.ok;
    if (!adsAllowed) {
      push({
        kind: "info",
        message:
          "ok" in gate && !gate.ok
            ? gate.reason
            : "Transparency indisponível.",
      });
    } else {
      push({
        kind: "info",
        message: "Transparency ativo — a descobrir lojas via Google Ads.",
      });
    }
  }

  let companiesScanned = 0;
  let domainsScanned = 0;
  let newCompanies = 0;
  let newDomains = 0;

  try {
    const purged = await purgeNonShopifyJunk(ws);
    if (purged.removedDomains || purged.removedCompanies) {
      push({
        kind: "info",
        message: `Limpeza: −${purged.removedDomains} domains não-Shopify, −${purged.removedCompanies} empresas lixo`,
        meta: purged,
      });
    }

    const companyFilter = opts?.companyId
      ? {
          _id: new mongoose.Types.ObjectId(opts.companyId),
          workspaceId: ws,
          deletedAt: null,
        }
      : { workspaceId: ws, deletedAt: null };

    const queue: { companyId: mongoose.Types.ObjectId; depth: number }[] = [];
    const companies = await CompetitorCompany.find(companyFilter)
      .select("_id legalName seedHosts")
      .lean();
    for (const c of companies) {
      if (isNoiseLegalName(c.legalName)) continue;
      queue.push({ companyId: c._id, depth: 0 });
    }

    const seenCompanies = new Set<string>();
    const seenHosts = new Set<string>();

    while (queue.length > 0 && domainsScanned < maxDomains) {
      const item = queue.shift()!;
      const cid = String(item.companyId);
      if (seenCompanies.has(cid)) continue;
      seenCompanies.add(cid);

      const company = await CompetitorCompany.findOne({
        _id: item.companyId,
        deletedAt: null,
      });
      if (!company || isNoiseLegalName(company.legalName)) continue;
      companiesScanned++;

      // Seeds — só Shopify
      for (const seed of company.seedHosts ?? []) {
        if (!isPlausibleStoreHost(seed)) continue;
        const host = normalizeHost(seed);
        const before = await CompetitorDomain.findOne({
          workspaceId: ws,
          host,
          deletedAt: null,
          isShopify: true,
        }).lean();
        const domain = await ensureShopifyDomain(ws, seed, {
          companyId: company._id,
          discoverySource: "seed",
        });
        if (!domain) {
          push({
            kind: "info",
            message: `Seed ignorado (não Shopify): ${host}`,
            companyId: company._id,
            host,
          });
          continue;
        }
        if (!before) {
          newDomains++;
          push({
            kind: "domain_found",
            message: `Loja Shopify seed ${domain.host}`,
            companyId: company._id,
            domainId: domain._id,
            host: domain.host,
          });
        }
        await upsertLink(
          ws,
          "company",
          company._id,
          "domain",
          domain._id,
          "seed",
        );
      }

      // Ads Google — automático (nome legal → advertiser → landing hosts)
      if (adsAllowed) {
        const byAdv = await searchTransparencyByAdvertiser(company.legalName);
        push({
          kind: "info",
          message: `Transparency «${company.legalName}»: ~${byAdv.activeAdCount} ads, ${byAdv.discoveredHosts.length} hosts`,
          companyId: company._id,
          legalName: company.legalName,
          meta: { note: byAdv.note },
        });
        if (byAdv.note?.includes("429") || byAdv.note?.includes("captcha")) {
          adsAllowed = false;
        }
        for (const host of byAdv.discoveredHosts) {
          if (seenHosts.has(host) || domainsScanned >= maxDomains) continue;
          if (!isPlausibleStoreHost(host)) continue;
          seenHosts.add(host);
          const domain = await ensureShopifyDomain(ws, host, {
            companyId: company._id,
            discoverySource: "transparency",
          });
          if (!domain) continue;
          newDomains++;
          push({
            kind: "domain_found",
            message: `Loja Shopify via ads: ${host}`,
            companyId: company._id,
            domainId: domain._id,
            host,
          });
          await upsertLink(
            ws,
            "company",
            company._id,
            "domain",
            domain._id,
            "ads_landing",
            { via: "advertiser_search" },
          );
        }
      } else if (wantAds) {
        push({
          kind: "info",
          message:
            "Transparency em cooldown / desligado — scan só com seeds + Impressum.",
          companyId: company._id,
        });
      }

      // Lojas desta empresa + órfãs Shopify (companyId null / empresa apagada)
      const orphanIds = (
        await CompetitorCompany.find({
          workspaceId: ws,
          deletedAt: { $ne: null },
        })
          .select("_id")
          .lean()
      ).map((x) => x._id);

      const domains = await CompetitorDomain.find({
        workspaceId: ws,
        deletedAt: null,
        isShopify: true,
        $or: [
          { companyId: company._id },
          { companyId: null },
          ...(orphanIds.length
            ? [{ companyId: { $in: orphanIds } }]
            : []),
        ],
      })
        .lean();

      for (const d of domains) {
        if (domainsScanned >= maxDomains) break;
        domainsScanned++;
        seenHosts.add(d.host);

        const impressum = await crawlImpressum(d.host);
        // Só remover quando o crawl confirma explicitamente não-Shopify.
        // null = host inacessível / detecção falhou — NÃO apagar lojas existentes.
        if (impressum.isShopify === false) {
          await CompetitorDomain.updateOne(
            { _id: d._id },
            {
              $set: {
                deletedAt: new Date(),
                isShopify: false,
                isActive: false,
                lastScannedAt: new Date(),
              },
            },
          );
          push({
            kind: "info",
            message: `Removido (já não Shopify): ${d.host}`,
            domainId: d._id as mongoose.Types.ObjectId,
            host: d.host,
          });
          continue;
        }
        if (impressum.isShopify == null) {
          push({
            kind: "info",
            message: `Impressum inconclusivo (mantido): ${d.host}`,
            domainId: d._id as mongoose.Types.ObjectId,
            host: d.host,
          });
          await CompetitorDomain.updateOne(
            { _id: d._id },
            { $set: { lastScannedAt: new Date() } },
          );
          continue;
        }

        await CompetitorDomain.updateOne(
          { _id: d._id },
          {
            $set: {
              lastScannedAt: new Date(),
              isShopify: true,
              ...(impressum.brandName
                ? { brandName: impressum.brandName }
                : {}),
              ...(impressum.country ? { country: impressum.country } : {}),
            },
          },
        );

        // Só o canónico curto (ex. CAVALEIRUS LLC). Nunca gravar blobs Impressum.
        const seenLegal = new Set<string>();
        for (const legal of impressum.legalNames) {
          const canonical = extractCanonicalLegalName(legal);
          if (!canonical || isNoiseLegalName(canonical)) continue;
          if (seenLegal.has(canonical)) continue;
          seenLegal.add(canonical);

          const before = await CompetitorCompany.findOne({
            workspaceId: ws,
            legalNameKey: normalizeLegalName(canonical),
            deletedAt: null,
          }).lean();
          const linked = await ensureCompany(ws, canonical, {
            entityId: impressum.entityId,
          });
          if (!linked) continue;
          if (!before) {
            newCompanies++;
            push({
              kind: "company_found",
              message: `Empresa via Impressum ${d.host}: ${canonical}`,
              companyId: linked._id,
              domainId: d._id,
              host: d.host,
              legalName: canonical,
            });
            if (item.depth < maxDepth) {
              queue.push({ companyId: linked._id, depth: item.depth + 1 });
            }
          }
          // Não saltar companyId entre várias empresas no mesmo Impressum —
          // só atribuir se a loja ainda não tem empresa válida.
          const current = await CompetitorDomain.findById(d._id)
            .select("companyId")
            .lean();
          const curId = current?.companyId
            ? String(current.companyId)
            : null;
          let keepCurrent = false;
          if (curId) {
            const curCo = await CompetitorCompany.findOne({
              _id: current!.companyId,
              deletedAt: null,
            })
              .select("legalName")
              .lean();
            keepCurrent = Boolean(
              curCo && !isNoiseLegalName(curCo.legalName),
            );
          }
          if (!keepCurrent) {
            await CompetitorDomain.updateOne(
              { _id: d._id },
              { $set: { companyId: linked._id } },
            );
          }
          await upsertLink(
            ws,
            "company",
            linked._id,
            "domain",
            d._id as mongoose.Types.ObjectId,
            "same_legal",
          );
        }

        // Hosts irmãos mencionados no Impressum / privacy
        for (const host of impressum.relatedHosts) {
          if (seenHosts.has(host) || domainsScanned >= maxDomains) continue;
          seenHosts.add(host);
          const domain = await ensureShopifyDomain(ws, host, {
            companyId: company._id,
            discoverySource: "impressum",
          });
          if (!domain) continue;
          newDomains++;
          push({
            kind: "domain_found",
            message: `Loja Shopify via Impressum: ${host}`,
            companyId: company._id,
            domainId: domain._id,
            host,
          });
          await upsertLink(
            ws,
            "company",
            company._id,
            "domain",
            domain._id,
            "same_legal",
            { via: "impressum_related" },
          );
        }

        // Ads por domain — só modo includeAds + gate
        if (!adsAllowed) continue;

        const byDom = await searchTransparencyByDomain(d.host);
        if (byDom.note?.includes("429") || byDom.note?.includes("captcha")) {
          adsAllowed = false;
          continue;
        }
        const dateKey = todayKey();
        await CompetitorAdSnapshot.findOneAndUpdate(
          {
            workspaceId: ws,
            domainId: d._id,
            dateKey,
          },
          {
            $set: {
              workspaceId: ws,
              domainId: d._id,
              host: d.host,
              dateKey,
              advertiserName: byDom.advertisers[0] ?? null,
              advertiserVerified: byDom.creatives.some(
                (c) => c.advertiserVerified,
              ),
              activeAdCount: byDom.activeAdCount,
              creatives: byDom.creatives,
              rawNote: byDom.note,
            },
          },
          { upsert: true },
        );

        await CompetitorDomain.updateOne(
          { _id: d._id },
          {
            $set: {
              activeAdCount: byDom.activeAdCount,
              advertisers: byDom.advertisers,
              lastScannedAt: new Date(),
            },
          },
        );

        push({
          kind: "ads_updated",
          message: `${d.host}: ${byDom.activeAdCount} ads Google`,
          domainId: d._id as mongoose.Types.ObjectId,
          host: d.host,
        });

        // Landing / display hosts extra nos creatives deste domain
        for (const host of byDom.discoveredHosts) {
          if (seenHosts.has(host) || domainsScanned >= maxDomains) continue;
          if (!isPlausibleStoreHost(host)) continue;
          seenHosts.add(host);
          const domain = await ensureShopifyDomain(ws, host, {
            companyId: company._id,
            discoverySource: "loop",
          });
          if (!domain) continue;
          newDomains++;
          push({
            kind: "domain_found",
            message: `Loja Shopify via ads loop: ${host}`,
            companyId: company._id,
            domainId: domain._id,
            host,
          });
          await upsertLink(
            ws,
            "company",
            company._id,
            "domain",
            domain._id,
            "ads_landing",
            { via: "domain_creatives" },
          );
        }
      }

      await refreshCompanyAggregates(ws, company._id);
      await CompetitorCompany.updateOne(
        { _id: company._id },
        { $set: { lastScannedAt: new Date() } },
      );
    }

    await CompetitorDiscoveryRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: "ok",
          finishedAt: new Date(),
          companiesScanned,
          domainsScanned,
          newCompanies,
          newDomains,
          events: events.map((e) => ({
            ...e,
            at: new Date(),
          })),
        },
      },
    );

    return {
      runId: String(run._id),
      companiesScanned,
      domainsScanned,
      newCompanies,
      newDomains,
      events,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no discovery";
    await CompetitorDiscoveryRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: "error",
          finishedAt: new Date(),
          error: msg,
          companiesScanned,
          domainsScanned,
          newCompanies,
          newDomains,
          events: events.map((ev) => ({ ...ev, at: new Date() })),
        },
      },
    );
    throw e;
  }
}

export async function getCompetitorMapData(workspaceId: WsId) {
  await connectToDatabase();
  const ws = oid(workspaceId);

  const [companiesRaw, domains, links, latestSnaps] = await Promise.all([
    CompetitorCompany.find({ workspaceId: ws, deletedAt: null })
      .sort({ storeCount: -1, legalName: 1 })
      .lean(),
    CompetitorDomain.find({
      workspaceId: ws,
      deletedAt: null,
      isShopify: true,
    })
      .sort({ activeAdCount: -1, host: 1 })
      .lean(),
    CompetitorLink.find({ workspaceId: ws }).lean(),
    CompetitorAdSnapshot.aggregate([
      { $match: { workspaceId: ws } },
      { $sort: { dateKey: -1 } },
      {
        $group: {
          _id: "$domainId",
          dateKey: { $first: "$dateKey" },
          activeAdCount: { $first: "$activeAdCount" },
          creatives: { $first: "$creatives" },
          advertiserName: { $first: "$advertiserName" },
        },
      },
    ]),
  ]);

  // Não esconder empresas manuais: o filtro de noise só remove lixo óbvio
  // (nomes sem forma societária). O resto fica visível no mapa.
  const companiesClean = companiesRaw.filter((c) => {
    const name = (c.legalName ?? "").trim();
    if (!name) return false;
    // Lixo curto sem LLC/Ltd/etc. — esconder
    if (
      isNoiseLegalName(name) &&
      !/\b(LLC|L\.L\.C\.|LIMITED|LTD\.?|INC\.?|GMBH)\b/i.test(name)
    ) {
      return false;
    }
    return true;
  });
  const byLegalKey = new Map(
    companiesClean.map((c) => [normalizeLegalName(c.legalName), c] as const),
  );
  const activeCompanyIds = new Set(companiesClean.map((c) => String(c._id)));

  // Domínios apontam para empresas-lixo filtradas → remapar para o canónico
  const companyIdByDomain = new Map<string, string | null>();
  for (const d of domains) {
    const rawCid = d.companyId ? String(d.companyId) : null;
    if (rawCid && activeCompanyIds.has(rawCid)) {
      companyIdByDomain.set(String(d._id), rawCid);
      continue;
    }
    let resolved: string | null = null;
    if (rawCid) {
      const junk = companiesRaw.find((c) => String(c._id) === rawCid);
      const canonical = junk
        ? extractCanonicalLegalName(junk.legalName)
        : null;
      if (canonical) {
        const good = byLegalKey.get(normalizeLegalName(canonical));
        if (good) resolved = String(good._id);
      }
    }
    companyIdByDomain.set(String(d._id), resolved);
  }

  const liveByCompany = new Map<
    string,
    { stores: number; ads: number; countries: Set<string> }
  >();
  for (const d of domains) {
    const cid = companyIdByDomain.get(String(d._id));
    if (!cid) continue;
    const row = liveByCompany.get(cid) ?? {
      stores: 0,
      ads: 0,
      countries: new Set<string>(),
    };
    row.stores += 1;
    row.ads += d.activeAdCount ?? 0;
    if (d.country) row.countries.add(d.country);
    liveByCompany.set(cid, row);
  }

  const snapByDomain = new Map(
    latestSnaps.map((s) => [String(s._id), s] as const),
  );

  const byCountry = new Map<
    string,
    { country: string; stores: number; activeAds: number }
  >();
  for (const d of domains) {
    const c = d.country || "XX";
    const row = byCountry.get(c) ?? {
      country: c,
      stores: 0,
      activeAds: 0,
    };
    row.stores += 1;
    row.activeAds += d.activeAdCount ?? 0;
    byCountry.set(c, row);
  }

  const domainIds = new Set(domains.map((d) => String(d._id)));
  // Mostrar todas as empresas limpas (incl. acabadas de adicionar, sem lojas ainda)
  const companies = companiesClean;
  const companyIds = new Set(companies.map((c) => String(c._id)));

  return {
    companies: companies.map((c) => {
      const live = liveByCompany.get(String(c._id));
      return {
        id: String(c._id),
        legalName: c.legalName,
        entityId: c.entityId ?? null,
        registryCountry: c.registryCountry ?? null,
        storeCount: live?.stores ?? 0,
        activeAdCount: live?.ads ?? 0,
        countries: live ? [...live.countries].sort() : (c.countries ?? []),
        seedHosts: c.seedHosts ?? [],
        lastScannedAt: c.lastScannedAt?.toISOString() ?? null,
        notes: c.notes ?? "",
      };
    }),
    domains: domains.map((d) => {
      const snap = snapByDomain.get(String(d._id));
      const companyId = companyIdByDomain.get(String(d._id)) ?? null;
      return {
        id: String(d._id),
        host: d.host,
        companyId:
          companyId && companyIds.has(companyId) ? companyId : companyId,
        brandName: d.brandName ?? null,
        country: d.country ?? null,
        isShopify: true as const,
        isActive: d.isActive !== false,
        activeAdCount: d.activeAdCount ?? 0,
        advertisers: d.advertisers ?? [],
        discoverySource: d.discoverySource ?? "manual",
        creatives: (snap?.creatives ?? []).slice(0, 40),
        snapDateKey: (snap?.dateKey as string | undefined) ?? null,
      };
    }),
    links: links
      .filter((l) => {
        const fromOk =
          l.fromType === "company"
            ? companyIds.has(String(l.fromId))
            : domainIds.has(String(l.fromId));
        const toOk =
          l.toType === "company"
            ? companyIds.has(String(l.toId))
            : domainIds.has(String(l.toId));
        return fromOk && toOk;
      })
      .map((l) => ({
        fromType: l.fromType,
        fromId: String(l.fromId),
        toType: l.toType,
        toId: String(l.toId),
        kind: l.kind,
      })),
    byCountry: [...byCountry.values()].sort((a, b) => b.stores - a.stores),
  };
}
