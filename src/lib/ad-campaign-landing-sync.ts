import "server-only";
import type { Types } from "mongoose";
import { AdCampaignTarget } from "@/models/AdCampaignTarget";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  googleLoginCustomerIdFromCreds,
  loadSyncAdAccountsForStore,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { fetchGoogleCampaignLandingUrls } from "@/lib/google-ads";
import { fetchMetaCampaignLandingUrls } from "@/lib/meta-ads";
import {
  extractCollectionHandlesFromUrls,
  extractProductHandlesFromUrls,
  normalizeLandingUrls,
  normalizeShopifyHandle,
} from "@/lib/collection-url-match";

export type CampaignLandingSyncResult = {
  storeId: string;
  campaignsUpdated: number;
  accountsFailed: number;
  urlsFound: number;
  errors: string[];
};

async function fetchLandingRows(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
): Promise<Array<{ campaignId: string; campaignName: string; landingUrls: string[] }>> {
  const token = credentialTokenForPlatform(platform, creds);
  switch (platform) {
    case "google":
      return fetchGoogleCampaignLandingUrls(
        token,
        externalAccountId,
        googleLoginCustomerIdFromCreds(creds),
      );
    case "meta":
      return fetchMetaCampaignLandingUrls(token, externalAccountId);
    default:
      return [];
  }
}

function uniqueHandles(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const h = normalizeShopifyHandle(r);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

function normalizeCampaignId(raw: string): string {
  const t = String(raw ?? "").trim();
  const m = t.match(/campaigns\/(\d+)/i);
  if (m?.[1]) return m[1];
  return t;
}

export { normalizeCampaignId };

/**
 * Sincroniza URLs de destino dos ads → agrega por campanha.
 * `collectionHandles` = **só** o que está no URL das ads (`/collections/{handle}`).
 * Não usa coleção principal do produto (ex. chaussures) — isso distorce o ROAS.
 * `productHandles` fica guardado para auditoria; não entra no cruzamento ROAS.
 */
export async function syncAdCampaignLandingsForStore(
  storeId: string,
  options?: { platforms?: AdPlatform[] },
): Promise<CampaignLandingSyncResult> {
  const { Store } = await import("@/models/Store");
  const store = await Store.findById(storeId).select("workspaceId").lean();
  if (!store) {
    return {
      storeId,
      campaignsUpdated: 0,
      accountsFailed: 0,
      urlsFound: 0,
      errors: [],
    };
  }

  const accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    return {
      storeId,
      campaignsUpdated: 0,
      accountsFailed: 0,
      urlsFound: 0,
      errors: [],
    };
  }

  let campaignsUpdated = 0;
  let accountsFailed = 0;
  let urlsFound = 0;
  const errors: string[] = [];

  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    if (options?.platforms && !options.platforms.includes(platform)) continue;
    if (platform !== "google" && platform !== "meta") continue;

    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const rows = await fetchLandingRows(
        platform,
        creds,
        acc.externalAccountId,
      );

      for (const row of rows) {
        const campaignId = normalizeCampaignId(row.campaignId);
        if (!campaignId) continue;

        const landingUrls = normalizeLandingUrls(row.landingUrls);
        urlsFound += landingUrls.length;

        // Só a coleção literalmente linkada no URL da ad
        const collectionHandles = uniqueHandles(
          extractCollectionHandlesFromUrls(landingUrls),
        );
        const productHandles = uniqueHandles(
          extractProductHandlesFromUrls(landingUrls),
        );

        await AdCampaignTarget.findOneAndUpdate(
          {
            storeId: store._id,
            adAccountId: acc._id,
            platform,
            campaignId,
          },
          {
            $set: {
              workspaceId: store.workspaceId as Types.ObjectId,
              storeId: store._id,
              adAccountId: acc._id,
              platform,
              campaignId,
              campaignName: row.campaignName,
              landingUrls,
              collectionHandles,
              productHandles,
              syncedAt: new Date(),
            },
          },
          { upsert: true },
        );
        campaignsUpdated += 1;
      }
    } catch (e) {
      accountsFailed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${platform}/${acc.externalAccountId}: ${msg}`);
    }
  }

  return { storeId, campaignsUpdated, accountsFailed, urlsFound, errors };
}
