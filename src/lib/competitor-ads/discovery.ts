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
  countryFromTld,
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
  },
) {
  if (isNoiseLegalName(legalName)) return null;
  await connectToDatabase();
  const ws = oid(workspaceId);
  const key = normalizeLegalName(legalName);
  const doc = await CompetitorCompany.findOneAndUpdate(
    { workspaceId: ws, legalNameKey: key, deletedAt: null },
    {
      $setOnInsert: {
        workspaceId: ws,
        legalName: legalName.trim(),
        legalNameKey: key,
      },
      $set: {
        ...(opts?.entityId ? { entityId: opts.entityId } : {}),
        ...(opts?.registryCountry
          ? { registryCountry: opts.registryCountry }
          : {}),
        ...(opts?.notes != null ? { notes: opts.notes } : {}),
      },
      ...(opts?.seedHosts?.length
        ? { $addToSet: { seedHosts: { $each: opts.seedHosts.map(normalizeHost) } } }
        : {}),
    },
    { upsert: true, returnDocument: "after" },
  );
  return doc;
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

  const impressum = await crawlImpressum(host);
  if (!impressum.isShopify) {
    // Soft-delete se já existia como lixo
    await CompetitorDomain.updateOne(
      { workspaceId: ws, host, deletedAt: null },
      { $set: { deletedAt: new Date(), isShopify: false, isActive: false } },
    );
    return null;
  }

  const country = countryFromTld(host);
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
    if (!isNoiseLegalName(c.legalName)) continue;
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
 * Loop: empresa → Transparency (mundo) → domains → Impressum → novas empresas → …
 * maxDepth limita explosão.
 */
export async function runCompetitorDiscovery(
  workspaceId: WsId,
  opts?: {
    trigger?: "manual" | "cron" | "seed";
    companyId?: string;
    maxDepth?: number;
    maxDomains?: number;
  },
) {
  await connectToDatabase();
  const ws = oid(workspaceId);
  const maxDepth = opts?.maxDepth ?? 2;
  const maxDomains = opts?.maxDomains ?? 40;

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

      // Transparency by advertiser name — WORLD (RPC f.req)
      const byAdv = await searchTransparencyByAdvertiser(company.legalName);
      push({
        kind: "info",
        message: `Transparency «${company.legalName}»: ~${byAdv.activeAdCount} ads, ${byAdv.discoveredHosts.length} hosts, ids=${byAdv.advertiserIds.length}`,
        companyId: company._id,
        legalName: company.legalName,
        meta: {
          note: byAdv.note,
          hosts: byAdv.discoveredHosts.slice(0, 20),
          advertiserIds: byAdv.advertiserIds,
        },
      });

      if (
        byAdv.discoveredHosts.length === 0 &&
        !(company.seedHosts ?? []).length
      ) {
        push({
          kind: "info",
          message:
            "Sem hosts descobertos. Adiciona domains seed (ex. loja Shopify conhecida) e volta a fazer Scan.",
          companyId: company._id,
        });
      }

      for (const host of byAdv.discoveredHosts) {
        if (seenHosts.has(host) || domainsScanned >= maxDomains) continue;
        if (!isPlausibleStoreHost(host)) continue;
        seenHosts.add(host);
        const existed = await CompetitorDomain.findOne({
          workspaceId: ws,
          host,
          deletedAt: null,
          isShopify: true,
        }).lean();
        const domain = await ensureShopifyDomain(ws, host, {
          companyId: company._id,
          discoverySource: "transparency",
        });
        if (!domain) continue;
        if (!existed) {
          newDomains++;
          push({
            kind: "domain_found",
            message: `Loja Shopify via ads: ${host}`,
            companyId: company._id,
            domainId: domain._id,
            host,
          });
        }
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

      // Scan só lojas Shopify desta empresa
      const domains = await CompetitorDomain.find({
        workspaceId: ws,
        companyId: company._id,
        deletedAt: null,
        isShopify: true,
      })
        .limit(30)
        .lean();

      for (const d of domains) {
        if (domainsScanned >= maxDomains) break;
        domainsScanned++;
        seenHosts.add(d.host);

        const impressum = await crawlImpressum(d.host);
        if (!impressum.isShopify) {
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

        await CompetitorDomain.updateOne(
          { _id: d._id },
          {
            $set: {
              lastScannedAt: new Date(),
              isShopify: true,
              ...(impressum.brandName
                ? { brandName: impressum.brandName }
                : {}),
            },
          },
        );

        for (const legal of impressum.legalNames) {
          if (isNoiseLegalName(legal)) continue;
          const before = await CompetitorCompany.findOne({
            workspaceId: ws,
            legalNameKey: normalizeLegalName(legal),
            deletedAt: null,
          }).lean();
          const linked = await ensureCompany(ws, legal, {
            entityId: impressum.entityId,
          });
          if (!linked) continue;
          if (!before) {
            newCompanies++;
            push({
              kind: "company_found",
              message: `Empresa via Impressum ${d.host}: ${legal}`,
              companyId: linked._id,
              domainId: d._id,
              host: d.host,
              legalName: legal,
            });
            if (item.depth < maxDepth) {
              queue.push({ companyId: linked._id, depth: item.depth + 1 });
            }
          }
          await CompetitorDomain.updateOne(
            { _id: d._id },
            { $set: { companyId: linked._id } },
          );
          await upsertLink(
            ws,
            "company",
            linked._id,
            "domain",
            d._id as mongoose.Types.ObjectId,
            "same_legal",
          );
        }

        const byDom = await searchTransparencyByDomain(d.host);
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
          message: `${d.host}: ${byDom.activeAdCount} ads Google (mundo)`,
          domainId: d._id as mongoose.Types.ObjectId,
          host: d.host,
          meta: {
            creatives: byDom.creatives.length,
            advertisers: byDom.advertisers,
          },
        });

        for (const adv of byDom.advertisers) {
          if (isNoiseLegalName(adv)) continue;
          const before = await CompetitorCompany.findOne({
            workspaceId: ws,
            legalNameKey: normalizeLegalName(adv),
            deletedAt: null,
          }).lean();
          const linked = await ensureCompany(ws, adv);
          if (!linked) continue;
          if (!before) {
            newCompanies++;
            push({
              kind: "company_found",
              message: `Advertiser Google: ${adv}`,
              companyId: linked._id,
              host: d.host,
              legalName: adv,
            });
            if (item.depth < maxDepth) {
              queue.push({ companyId: linked._id, depth: item.depth + 1 });
            }
          }
          await upsertLink(
            ws,
            "company",
            linked._id,
            "domain",
            d._id as mongoose.Types.ObjectId,
            "same_advertiser",
          );
        }

        for (const host of byDom.discoveredHosts) {
          if (seenHosts.has(host) || domainsScanned >= maxDomains) continue;
          if (!isPlausibleStoreHost(host)) continue;
          seenHosts.add(host);
          const existed = await CompetitorDomain.findOne({
            workspaceId: ws,
            host,
            deletedAt: null,
            isShopify: true,
          }).lean();
          const domain = await ensureShopifyDomain(ws, host, {
            companyId: company._id,
            discoverySource: "loop",
          });
          if (!domain) continue;
          if (!existed) {
            newDomains++;
            push({
              kind: "domain_found",
              message: `Loja Shopify loop: ${host}`,
              companyId: company._id,
              domainId: domain._id,
              host,
            });
          }
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

  // Todas as empresas (exceto lixo) — seeds sem lojas Shopify ainda têm de aparecer
  const companies = companiesRaw.filter((c) => !isNoiseLegalName(c.legalName));

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
  const companyIds = new Set(companies.map((c) => String(c._id)));

  return {
    companies: companies.map((c) => ({
      id: String(c._id),
      legalName: c.legalName,
      entityId: c.entityId ?? null,
      registryCountry: c.registryCountry ?? null,
      storeCount: c.storeCount ?? 0,
      activeAdCount: c.activeAdCount ?? 0,
      countries: c.countries ?? [],
      seedHosts: c.seedHosts ?? [],
      lastScannedAt: c.lastScannedAt?.toISOString() ?? null,
      notes: c.notes ?? "",
    })),
    domains: domains.map((d) => {
      const snap = snapByDomain.get(String(d._id));
      return {
        id: String(d._id),
        host: d.host,
        companyId: d.companyId ? String(d.companyId) : null,
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
