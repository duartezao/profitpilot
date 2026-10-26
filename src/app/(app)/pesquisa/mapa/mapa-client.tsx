"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  ExternalLink,
  Globe2,
  Plus,
  Radar,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import {
  addCompetitorCompanyAction,
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

type CompanyNodeData = {
  label: string;
  sub: string;
};

type DomainNodeData = {
  label: string;
  sub: string;
};

const CompanyNode = memo(function CompanyNode({
  data,
}: NodeProps<Node<CompanyNodeData>>) {
  return (
    <div className="w-[220px] rounded-lg border border-accent/50 bg-surface px-3 py-2 text-left shadow-none">
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-accent"
      />
      <p className="text-xs font-medium text-foreground leading-snug break-words">
        {data.label}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
        {data.sub}
      </p>
    </div>
  );
});

const DomainNode = memo(function DomainNode({
  data,
}: NodeProps<Node<DomainNodeData>>) {
  return (
    <div className="w-[200px] cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left shadow-none">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-muted-foreground"
      />
      <p className="text-[11px] font-medium text-foreground leading-snug break-all">
        {data.label}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
        {data.sub}
      </p>
    </div>
  );
});

const nodeTypes = {
  company: CompanyNode,
  domain: DomainNode,
};

export function MapaClient({
  companies,
  domains,
  links,
  byCountry,
  canEdit,
}: {
  companies: MapCompany[];
  domains: MapDomain[];
  links: MapLink[];
  byCountry: CountryStat[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";
  const [country, setCountry] = useState<string>("all");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredDomains = useMemo(() => {
    if (country === "all") return domains;
    if (country === "XX") return domains.filter((d) => !d.country);
    return domains.filter((d) => d.country === country);
  }, [domains, country]);

  const filteredCompanyIds = useMemo(() => {
    const ids = new Set(
      filteredDomains.map((d) => d.companyId).filter(Boolean) as string[],
    );
    for (const c of companies) {
      if (country === "all") ids.add(c.id);
      else if (c.countries.includes(country) || c.countries.length === 0) {
        ids.add(c.id);
      }
    }
    return ids;
  }, [filteredDomains, companies, country]);

  const selected = selectedDomainId
    ? domains.find((d) => d.id === selectedDomainId)
    : null;

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = [];
    const es: Edge[] = [];
    const comps = companies.filter((c) => filteredCompanyIds.has(c.id));
    comps.forEach((c, i) => {
      ns.push({
        id: `c:${c.id}`,
        type: "company",
        position: { x: 40, y: i * 110 },
        data: {
          label: c.legalName,
          sub: `${c.storeCount} lojas · ${c.activeAdCount} ads`,
        },
      });
    });
    filteredDomains.forEach((d, i) => {
      ns.push({
        id: `d:${d.id}`,
        type: "domain",
        position: { x: 340, y: i * 72 },
        data: {
          label: d.host,
          sub: `${d.country ?? "—"} · ${d.activeAdCount} ads`,
        },
      });
      if (d.companyId && filteredCompanyIds.has(d.companyId)) {
        es.push({
          id: `e-${d.companyId}-${d.id}`,
          source: `c:${d.companyId}`,
          target: `d:${d.id}`,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { stroke: "var(--accent)" },
        });
      }
    });
    for (const l of links) {
      if (l.fromType === "company" && l.toType === "domain") {
        const id = `l-${l.kind}-${l.fromId}-${l.toId}`;
        if (
          filteredCompanyIds.has(l.fromId) &&
          filteredDomains.some((d) => d.id === l.toId) &&
          !es.some((e) => e.id === id || e.id === `e-${l.fromId}-${l.toId}`)
        ) {
          es.push({
            id,
            source: `c:${l.fromId}`,
            target: `d:${l.toId}`,
            animated: l.kind === "same_advertiser",
            style: { stroke: "var(--muted-foreground)" },
          });
        }
      }
    }
    return { nodes: ns, edges: es };
  }, [companies, filteredDomains, filteredCompanyIds, links]);

  function runAction(
    action: (
      prev: CompetitorActionState,
      fd: FormData,
    ) => Promise<CompetitorActionState>,
    fd: FormData,
  ) {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const res = await action({}, fd);
        if (res.error) setErr(res.error);
        else {
          setMsg(res.message ?? "OK");
          router.refresh();
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erro inesperado.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Google Ads Transparency ·{" "}
            <span className="font-medium text-foreground">mundo (anywhere)</span>
            . Só lojas Shopify. Adiciona empresa → scan descobre lojas → loop.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/pesquisa"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Voltar à Pesquisa PR
          </Link>
          {canEdit && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    setMsg(null);
                    setErr(null);
                    const res = await purgeCompetitorJunkAction();
                    if (res.error) setErr(res.error);
                    else {
                      setMsg(res.message ?? "OK");
                      router.refresh();
                    }
                  });
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Limpar lixo
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  runAction(scanCompetitorsAction, fd);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                <Radar className={cn("h-4 w-4", pending && "animate-spin")} />
                Scan agora
              </button>
            </>
          )}
        </div>
      </div>

      {(msg || err) && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            err
              ? "border-negative/30 bg-negative/10 text-negative"
              : "border-positive/30 bg-positive/10 text-positive",
          )}
        >
          {err ?? msg}
        </p>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setCountry("all")}
          className={cn(
            "rounded-lg border bg-surface px-3 py-2 text-left",
            country === "all" ? "border-accent bg-accent/10" : "border-border",
          )}
        >
          <p className="text-xs text-muted-foreground">Mundo</p>
          <p className="font-medium tabular-nums text-foreground">
            {domains.length} lojas
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {domains.reduce((s, d) => s + d.activeAdCount, 0)} ads
          </p>
        </button>
        {byCountry.map((c) => (
          <button
            key={c.country}
            type="button"
            onClick={() => setCountry(c.country)}
            className={cn(
              "rounded-lg border bg-surface px-3 py-2 text-left",
              country === c.country
                ? "border-accent bg-accent/10"
                : "border-border",
            )}
          >
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe2 className="h-3 w-3" />
              {c.country === "XX" ? "Global/.com" : c.country}
            </p>
            <p className="font-medium tabular-nums text-foreground">
              {c.stores} lojas
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {c.activeAds} ads
            </p>
          </button>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-surface p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-medium flex items-center gap-2 text-foreground">
            <Plus className="h-4 w-4" /> Adicionar empresa
          </h2>
          {canEdit ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                runAction(addCompetitorCompanyAction, fd);
                form.reset();
              }}
            >
              <div>
                <label className="text-xs text-muted-foreground">
                  Nome legal (ex. ACME Handels GmbH)
                </label>
                <input
                  name="legalName"
                  required
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="ACME Handels GmbH"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Domains seed Shopify (recomendado, um por linha)
                </label>
                <textarea
                  name="seedHosts"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder={"loja-exemplo.de\noutra-loja.at"}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sem seed o Transparency pode achar ads mas não o domínio da
                  loja. Um domain Shopify conhecido desbloqueia o loop.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notas</label>
                <input
                  name="notes"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                Guardar seed
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Só leitura.</p>
          )}

          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {companies.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Ainda sem empresas.
              </li>
            )}
            {companies.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{c.legalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.storeCount} lojas · {c.activeAdCount} ads ·{" "}
                      {c.countries.join(", ") || "—"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Scan esta empresa"
                        disabled={pending}
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("companyId", c.id);
                          runAction(scanCompetitorsAction, fd);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remover"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await softDeleteCompetitorCompanyAction(c.id);
                            if (res.error) setErr(res.error);
                            else {
                              setMsg(res.message ?? "OK");
                              router.refresh();
                            }
                          });
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface lg:col-span-2 overflow-hidden">
          <div className="border-b border-border px-3 py-2 text-sm font-medium flex items-center gap-2 text-foreground">
            <Store className="h-4 w-4" />
            Mapa empresa → lojas
          </div>
          <div className="h-[420px] bg-background">
            {nodes.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Ainda sem dados. Adiciona uma empresa e corre Scan — o loop
                procura lojas Shopify em qualquer país.
              </p>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                colorMode={colorMode}
                onNodeClick={(_, n) => {
                  if (n.id.startsWith("d:")) {
                    setSelectedDomainId(n.id.slice(2));
                  }
                }}
                proOptions={{ hideAttribution: true }}
                className="!bg-background"
              >
                <Background gap={16} color="var(--border)" />
                <Controls className="!border-border !bg-surface !shadow-none [&>button]:!border-border [&>button]:!bg-surface [&>button]:!fill-foreground" />
                <MiniMap
                  pannable
                  zoomable
                  className="!border-border !bg-surface"
                  maskColor={
                    colorMode === "dark"
                      ? "rgba(9,9,11,0.7)"
                      : "rgba(242,242,244,0.7)"
                  }
                  nodeColor="var(--accent)"
                />
              </ReactFlow>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Loja</th>
                <th className="px-3 py-2 font-medium">País</th>
                <th className="px-3 py-2 font-medium">Ads ativos</th>
                <th className="px-3 py-2 font-medium">Shopify</th>
                <th className="px-3 py-2 font-medium">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {filteredDomains.map((d) => (
                <tr
                  key={d.id}
                  className={cn(
                    "border-b border-border/60 cursor-pointer hover:bg-muted/40",
                    selectedDomainId === d.id && "bg-accent/10",
                  )}
                  onClick={() => setSelectedDomainId(d.id)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">
                      {d.brandName || d.host}
                    </div>
                    <a
                      href={`https://${d.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.host} <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    {d.country ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-foreground">
                    {d.activeAdCount}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {d.isShopify ? "Sim" : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.discoverySource}
                  </td>
                </tr>
              ))}
              {filteredDomains.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Sem lojas neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium mb-3 text-foreground">
            Criativos Google
          </h3>
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Clica numa loja para ver criativos / advertisers.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground">{selected.host}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.activeAdCount} ads · snapshot{" "}
                  {selected.snapDateKey ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Advertisers:{" "}
                  {selected.advertisers.length
                    ? selected.advertisers.join(", ")
                    : "—"}
                </p>
              </div>
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {selected.creatives.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Sem criativos detalhados neste snapshot (Transparency pode
                    só devolver contagem / advertiser).
                  </li>
                )}
                {selected.creatives.map((c, i) => (
                  <li
                    key={c.creativeId ?? i}
                    className="rounded-lg border border-border bg-background p-2 text-xs"
                  >
                    <p className="font-medium text-foreground">
                      {c.advertiserName ?? "Advertiser"}
                    </p>
                    <p className="text-muted-foreground">
                      {c.format ?? "creative"}
                      {c.regions?.length
                        ? ` · ${c.regions.slice(0, 5).join(", ")}`
                        : ""}
                    </p>
                    {c.landingUrl && (
                      <a
                        href={c.landingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent break-all"
                      >
                        {c.landingUrl}
                      </a>
                    )}
                    {c.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.previewUrl}
                        alt=""
                        className="mt-2 max-h-28 rounded border border-border object-contain"
                      />
                    )}
                  </li>
                ))}
              </ul>
              <a
                href={`https://adstransparency.google.com/?region=anywhere&domain=${encodeURIComponent(selected.host)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent"
              >
                Abrir no Transparency (mundo){" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
