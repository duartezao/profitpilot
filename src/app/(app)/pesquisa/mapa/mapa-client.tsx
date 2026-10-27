"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Focus,
  ImageIcon,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Store,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addCompetitorCompanyAction,
  importCompetitorHostsAction,
  purgeCompetitorJunkAction,
  scanCompetitorsAction,
  softDeleteCompetitorCompanyAction,
  type CompetitorActionState,
} from "./actions";

export type MapCompany = {
  id: string;
  legalName: string;
  entityId: string | null;
  registryCountry: string | null;
  storeCount: number;
  activeAdCount: number;
  countries: string[];
  seedHosts: string[];
  lastScannedAt: string | null;
  notes: string;
};

export type MapDomain = {
  id: string;
  host: string;
  companyId: string | null;
  brandName: string | null;
  country: string | null;
  isShopify: boolean | null;
  isActive: boolean;
  activeAdCount: number;
  advertisers: string[];
  discoverySource: string;
  creatives: Array<{
    creativeId?: string | null;
    advertiserName?: string | null;
    previewUrl?: string | null;
    landingUrl?: string | null;
    format?: string | null;
    regions?: string[];
  }>;
  snapDateKey: string | null;
};

export type MapLink = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  kind: string;
};

export type CountryStat = {
  country: string;
  stores: number;
  activeAds: number;
};

type BubbleMetric = "ads" | "stores";
type ShowLimit = 10 | 25 | 50 | 100;

type BubbleNode = {
  id: string;
  company: MapCompany;
  x: number;
  y: number;
  r: number;
  metric: number;
  stores: number;
};

function isJunkDestHost(host: string) {
  return /google|gstatic|doubleclick|googleusercontent|facebook|fbcdn|tiktok|cdninstagram|youtube|ytimg/i.test(
    host,
  );
}

function realDestUrls(d: MapDomain): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      const u = new URL(href);
      if (isJunkDestHost(u.hostname)) return;
      if (/content\.js/i.test(u.pathname)) return;
      const key = u.toString();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(key);
    } catch {
      /* */
    }
  };
  for (const c of d.creatives) push(c.landingUrl);
  if (out.length === 0) push(`https://${d.host}`);
  return out;
}

function shortUrl(href: string) {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    const path = `${u.pathname}${u.search}`;
    if (!path || path === "/") return host;
    return `${host}${path.length > 40 ? `${path.slice(0, 40)}...` : path}`;
  } catch {
    return href;
  }
}

function countryLabel(code: string | null | undefined) {
  if (!code || code === "XX") return "—";
  return code;
}

function buildBubbles(
  ranked: Array<{ company: MapCompany; stores: number; ads: number }>,
  metric: BubbleMetric,
  width: number,
  height: number,
): BubbleNode[] {
  if (!ranked.length) return [];
  const cx = width / 2;
  const cy = height / 2;
  const values = ranked.map((r) =>
    Math.max(metric === "ads" ? r.ads : r.stores, 0),
  );
  const maxV = Math.max(...values, 1);
  const minR = 18;
  const maxR = Math.min(72, Math.max(36, Math.min(width, height) * 0.12));

  const nodes: BubbleNode[] = ranked.map((row, i) => {
    const v = values[i]!;
    const t = Math.sqrt(v / maxV);
    const r = minR + t * (maxR - minR);
    // hub no centro = maior; restantes em anéis
    if (i === 0) {
      return {
        id: row.company.id,
        company: row.company,
        x: cx,
        y: cy,
        r,
        metric: v,
        stores: row.stores,
      };
    }
    const ring = i <= 8 ? 1 : i <= 20 ? 2 : 3;
    const inRing = ranked.slice(
      ring === 1 ? 1 : ring === 2 ? 9 : 21,
      ring === 1 ? 9 : ring === 2 ? 21 : ranked.length,
    );
    const idxInRing =
      ring === 1 ? i - 1 : ring === 2 ? i - 9 : i - 21;
    const n = Math.max(inRing.length, 1);
    const base =
      Math.min(width, height) * (ring === 1 ? 0.28 : ring === 2 ? 0.4 : 0.48);
    const angle = -Math.PI / 2 + (idxInRing / n) * Math.PI * 2;
    return {
      id: row.company.id,
      company: row.company,
      x: cx + Math.cos(angle) * base,
      y: cy + Math.sin(angle) * base,
      r,
      metric: v,
      stores: row.stores,
    };
  });

  // Empurrões simples anti-overlap
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minDist = a.r + b.r + 10;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5;
          const ox = dx * push;
          const oy = dy * push;
          if (i !== 0) {
            a.x -= ox;
            a.y -= oy;
          }
          if (j !== 0) {
            b.x += ox;
            b.y += oy;
          }
        }
      }
    }
  }

  // Manter dentro do canvas
  const pad = 8;
  for (const n of nodes) {
    n.x = Math.min(width - n.r - pad, Math.max(n.r + pad, n.x));
    n.y = Math.min(height - n.r - pad, Math.max(n.r + pad, n.y));
  }

  return nodes;
}

export function MapaClient({
  companies,
  domains,
  links: _links,
  byCountry: _byCountry,
  canEdit,
}: {
  companies: MapCompany[];
  domains: MapDomain[];
  links: MapLink[];
  byCountry: CountryStat[];
  canEdit: boolean;
}) {
  void _links;
  void _byCountry;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<BubbleMetric>("ads");
  const [showLimit, setShowLimit] = useState<ShowLimit>(50);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 720, h: 480 });

  function flashMsg(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMsg(text);
    setErr(null);
    toastTimer.current = setTimeout(() => setMsg(null), 2800);
  }

  function flashErr(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setErr(text);
    setMsg(null);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.max(el.clientWidth, 320);
      const h = Math.max(el.clientHeight, 320);
      setStageSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ranked = useMemo(() => {
    const rows = companies.map((c) => {
      const stores = domains.filter((d) => d.companyId === c.id);
      const ads =
        c.activeAdCount ||
        stores.reduce((s, d) => s + (d.activeAdCount ?? 0), 0);
      return { company: c, stores: stores.length, ads };
    });
    rows.sort((a, b) => {
      const av = metric === "ads" ? a.ads : a.stores;
      const bv = metric === "ads" ? b.ads : b.stores;
      if (bv !== av) return bv - av;
      return a.company.legalName.localeCompare(b.company.legalName);
    });
    return rows;
  }, [companies, domains, metric]);

  const q = query.trim().toLowerCase();
  const filteredRanked = useMemo(() => {
    if (!q) return ranked;
    return ranked.filter((r) => {
      if (r.company.legalName.toLowerCase().includes(q)) return true;
      return domains.some(
        (d) =>
          d.companyId === r.company.id && d.host.toLowerCase().includes(q),
      );
    });
  }, [ranked, q, domains]);

  const listRows = filteredRanked;
  const mapRows = filteredRanked.slice(0, showLimit);

  const bubbles = useMemo(
    () => buildBubbles(mapRows, metric, stageSize.w, stageSize.h),
    [mapRows, metric, stageSize.w, stageSize.h],
  );

  const hub = bubbles[0] ?? null;
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? null;
  const companyStores = useMemo(() => {
    if (!selectedCompany) return [];
    return domains
      .filter((d) => d.companyId === selectedCompany.id)
      .sort((a, b) => (b.activeAdCount ?? 0) - (a.activeAdCount ?? 0));
  }, [domains, selectedCompany]);

  const selectedDomain = selectedDomainId
    ? domains.find((d) => d.id === selectedDomainId) ?? null
    : null;
  const destUrls = selectedDomain ? realDestUrls(selectedDomain) : [];

  const totalAds = ranked.reduce((s, r) => s + r.ads, 0);
  const totalStores = domains.length;
  const withAds = ranked.filter((r) => r.ads > 0).length;
  const creativesArchived = domains.reduce(
    (s, d) => s + (d.creatives?.length ?? 0),
    0,
  );

  const hoverNode =
    bubbles.find((b) => b.id === (hoverId ?? selectedCompanyId)) ?? null;

  const fit = useCallback(() => setZoom(1), []);

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl(null), 1400);
    });
  }

  function runAction(
    action: (
      prev: CompetitorActionState,
      fd: FormData,
    ) => Promise<CompetitorActionState>,
    fd: FormData,
    onOk?: (res: CompetitorActionState) => void,
  ) {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const res = await action({}, fd);
        if (res.error) flashErr(res.error);
        else {
          flashMsg(res.message ?? "OK");
          onOk?.(res);
          router.refresh();
        }
      } catch (e) {
        flashErr(e instanceof Error ? e.message : "Erro inesperado.");
      }
    });
  }

  function selectCompany(id: string) {
    setSelectedCompanyId(id);
    setSelectedDomainId(null);
  }

  // Vista detalhe empresa
  if (selectedCompany) {
    const row = ranked.find((r) => r.company.id === selectedCompany.id);
    const ads = row?.ads ?? selectedCompany.activeAdCount;
    const nStores = row?.stores ?? companyStores.length;

    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        {(msg || err) && (
          <Toast
            err={err}
            msg={msg}
            onClose={() => {
              setMsg(null);
              setErr(null);
            }}
          />
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => {
                setSelectedCompanyId(null);
                setSelectedDomainId(null);
              }}
              className="mb-2 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao mapa
            </button>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {selectedCompany.legalName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {nStores} lojas associadas
              {selectedCompany.countries.length > 0
                ? ` · ${selectedCompany.countries.slice(0, 4).join(" · ")}${
                    selectedCompany.countries.length > 4
                      ? ` +${selectedCompany.countries.length - 4}`
                      : ""
                  }`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("companyId", selectedCompany.id);
                    runAction(scanCompetitorsAction, fd);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
                >
                  <Radar className={cn("h-4 w-4", pending && "animate-spin")} />
                  Scan
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await softDeleteCompetitorCompanyAction(
                        selectedCompany.id,
                      );
                      if (res.error) flashErr(res.error);
                      else {
                        flashMsg(res.message ?? "OK");
                        setSelectedCompanyId(null);
                        router.refresh();
                      }
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard value={ads} label="Anúncios no Google" />
          <KpiCard
            value={creativesArchived}
            label="Criativos em arquivo"
          />
          <KpiCard value={nStores} label="Lojas associadas" />
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Lojas da empresa
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {companyStores.length}
            </span>
          </div>

          {companyStores.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Sem lojas Shopify. Adiciona seeds ou corre Scan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Loja / domínio</th>
                    <th className="px-4 py-2.5 font-medium">Mercado</th>
                    <th className="px-4 py-2.5 font-medium">Ads</th>
                    <th className="px-4 py-2.5 font-medium">Origem</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {companyStores.map((d) => (
                    <tr
                      key={d.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        selectedDomainId === d.id && "bg-muted/40",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedDomainId(d.id)}
                          className="text-left"
                        >
                          <p className="font-medium text-foreground">
                            {d.brandName || d.host}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {d.host}
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {countryLabel(d.country)}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-accent">
                        {d.activeAdCount}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {d.discoverySource}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href={`https://${d.host}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && (
            <form
              className="flex gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                fd.set("companyId", selectedCompany.id);
                runAction(importCompetitorHostsAction, fd);
                form.reset();
              }}
            >
              <input
                name="hosts"
                placeholder="Importar hosts Shopify…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
              >
                Importar
              </button>
            </form>
          )}
        </section>

        {selectedDomain && (
          <aside className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedDomain.brandName || selectedDomain.host}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedDomain.activeAdCount} ads ·{" "}
                  {countryLabel(selectedDomain.country)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDomainId(null)}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <a
                href={`https://${selectedDomain.host}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                Abrir loja <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`https://adstransparency.google.com/?region=anywhere&domain=${encodeURIComponent(selectedDomain.host)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Transparency <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              URL de destino
            </p>
            {destUrls.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem landing.</p>
            ) : (
              <ul className="space-y-1">
                {destUrls.map((url) => (
                  <li
                    key={url}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {shortUrl(url)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyUrl(url)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      {copiedUrl === url ? (
                        <Check className="h-3.5 w-3.5 text-positive" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1 text-accent hover:bg-muted"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    );
  }

  // Vista mapa (referência)
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Google Competitors
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Explora as lojas, acompanha as empresas e descobre os destinos dos
            anúncios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://adstransparency.google.com/?region=anywhere"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Google Ads <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  showAdd
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-muted",
                )}
              >
                <Plus className="h-4 w-4" />
                Empresa
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await purgeCompetitorJunkAction();
                    if (res.error) flashErr(res.error);
                    else {
                      flashMsg(res.message ?? "OK");
                      router.refresh();
                    }
                  });
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Limpar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction(scanCompetitorsAction, new FormData())}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("h-4 w-4", pending && "animate-spin")}
                />
                Sincronizar
              </button>
            </>
          )}
        </div>
      </div>

      {(msg || err) && (
        <Toast
          err={err}
          msg={msg}
          onClose={() => {
            setMsg(null);
            setErr(null);
          }}
        />
      )}

      {showAdd && canEdit && (
        <form
          className="grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            runAction(addCompetitorCompanyAction, fd, (res) => {
              form.reset();
              setShowAdd(false);
              if (res.companyId) selectCompany(res.companyId);
            });
          }}
        >
          <input
            name="legalName"
            required
            disabled={pending}
            placeholder="Nome legal (ex. GRACA ENTERPRISES LLC)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2 disabled:opacity-60"
          />
          <input
            name="seedHosts"
            disabled={pending}
            placeholder="Seeds Shopify (opcional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {pending ? "A guardar…" : "Guardar"}
          </button>
        </form>
      )}

      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Mapa de bolhas */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Mapa de empresas
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Dimensão
                <select
                  value={metric}
                  onChange={(e) =>
                    setMetric(e.target.value as BubbleMetric)
                  }
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value="ads">Anúncios</option>
                  <option value="stores">Lojas</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Mostrar
                <select
                  value={showLimit}
                  onChange={(e) =>
                    setShowLimit(Number(e.target.value) as ShowLimit)
                  }
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value={10}>10 maiores</option>
                  <option value={25}>25 maiores</option>
                  <option value={50}>50 maiores</option>
                  <option value={100}>100 maiores</option>
                </select>
              </label>
            </div>
          </div>

          <div
            ref={stageRef}
            className="relative min-h-[380px] flex-1 overflow-hidden bg-background"
            style={{ height: "min(62vh, 560px)" }}
          >
            {/* grelha CSS — cobre sempre o viewport */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: [
                  "radial-gradient(circle, color-mix(in oklab, var(--muted-foreground) 18%, transparent) 0.8px, transparent 1px)",
                  "linear-gradient(color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)",
                  "linear-gradient(90deg, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)",
                ].join(", "),
                backgroundSize: "16px 16px, 48px 48px, 48px 48px",
              }}
              aria-hidden
            />

            {bubbles.length === 0 ? (
              <div className="relative flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Sem empresas. Adiciona uma e sincroniza.
                </p>
              </div>
            ) : (
              <div
                className="absolute inset-0 origin-center transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              >
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${stageSize.w} ${stageSize.h}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {hub &&
                    bubbles.slice(1).map((b) => (
                      <line
                        key={`e-${b.id}`}
                        x1={hub.x}
                        y1={hub.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--border)"
                        strokeWidth={1}
                        opacity={0.85}
                      />
                    ))}
                  {bubbles.map((b, i) => {
                    const lit =
                      hoverId === b.id || selectedCompanyId === b.id;
                    const isHub = i === 0;
                    return (
                      <g key={b.id}>
                        <circle
                          cx={b.x}
                          cy={b.y}
                          r={b.r}
                          fill={
                            lit || isHub
                              ? "var(--accent)"
                              : "color-mix(in oklab, var(--accent) 35%, var(--surface))"
                          }
                          fillOpacity={lit || isHub ? 0.95 : 0.75}
                          stroke={
                            lit ? "var(--foreground)" : "var(--border)"
                          }
                          strokeWidth={lit ? 2 : 1}
                          className="cursor-pointer transition-[fill-opacity] duration-150"
                          onMouseEnter={() => setHoverId(b.id)}
                          onMouseLeave={() => setHoverId(null)}
                          onClick={() => selectCompany(b.id)}
                        />
                        {b.r >= 28 && (
                          <text
                            x={b.x}
                            y={b.y + 4}
                            textAnchor="middle"
                            className="pointer-events-none select-none"
                            fill="var(--accent-foreground)"
                            style={{
                              fontSize: Math.min(14, b.r * 0.45),
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 600,
                            }}
                          >
                            {b.metric}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* labels fora das bolhas pequenas */}
                {bubbles.map((b) =>
                  b.r < 28 ? (
                    <button
                      key={`lbl-${b.id}`}
                      type="button"
                      onMouseEnter={() => setHoverId(b.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => selectCompany(b.id)}
                      className="absolute -translate-x-1/2 truncate text-[10px] text-muted-foreground hover:text-foreground"
                      style={{
                        left: b.x,
                        top: b.y + b.r + 4,
                        maxWidth: 100,
                      }}
                    >
                      {b.company.legalName}
                    </button>
                  ) : null,
                )}
              </div>
            )}

            {hoverNode && (
              <div
                className="pointer-events-none absolute z-20 w-56 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm"
                style={{
                  left: Math.min(
                    stageSize.w - 230,
                    Math.max(8, hoverNode.x + hoverNode.r + 12),
                  ),
                  top: Math.max(8, hoverNode.y - 36),
                }}
              >
                <p className="truncate text-xs font-semibold text-foreground">
                  {hoverNode.company.legalName}
                </p>
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {hoverNode.metric}{" "}
                  {metric === "ads" ? "anúncios no Google" : "lojas"}
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {hoverNode.stores} lojas associadas
                </p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 hidden text-[10px] text-muted-foreground sm:block">
              Tamanho = {metric === "ads" ? "anúncios" : "lojas"} · linhas =
              hub → rede
            </div>

            <div className="absolute bottom-3 right-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
                className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-muted"
                title="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
                className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-muted"
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={fit}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                <Focus className="h-3.5 w-3.5" />
                Enquadrar
              </button>
            </div>
          </div>
        </section>

        {/* Lista empresas */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-3 py-3">
            <p className="text-sm font-medium text-foreground">Empresas</p>
            <p className="text-[11px] text-muted-foreground">
              Por {metric === "ads" ? "anúncios no Google" : "lojas"}
            </p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Empresa ou domínio…"
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs"
              />
            </div>
          </div>
          <ul className="max-h-[min(62vh,560px)] flex-1 overflow-y-auto p-1.5">
            {listRows.length === 0 ? (
              <li className="p-3 text-xs text-muted-foreground">
                Sem resultados.
              </li>
            ) : (
              listRows.map((row, i) => {
                const active = row.company.id === hoverId;
                const value = metric === "ads" ? row.ads : row.stores;
                return (
                  <li key={row.company.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoverId(row.company.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => selectCompany(row.company.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                        active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {row.company.legalName}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {row.stores} {row.stores === 1 ? "loja" : "lojas"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                        {value}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          value={companies.length}
          label="Concorrentes"
        />
        <KpiCard
          icon={<Radar className="h-4 w-4" />}
          value={totalAds}
          label="Anúncios no Google"
        />
        <KpiCard
          icon={<ImageIcon className="h-4 w-4" />}
          value={creativesArchived}
          label="Criativos em arquivo"
        />
        <KpiCard
          icon={<Store className="h-4 w-4" />}
          value={withAds}
          label="Com ads activos"
          hint={`${totalStores} lojas no total`}
        />
      </div>
    </div>
  );
}

function KpiCard({
  value,
  label,
  hint,
  icon,
}: {
  value: number;
  label: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {icon ? (
          <span className="text-muted-foreground">{icon}</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

function Toast({
  msg,
  err,
  onClose,
}: {
  msg: string | null;
  err: string | null;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs tabular-nums",
        err
          ? "border-negative/25 bg-negative/10 text-negative"
          : "border-border bg-surface text-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{err ?? msg}</span>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
