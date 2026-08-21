"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { ResearchItemView } from "@/lib/research";
import {
  RESEARCH_GENDER_LABEL,
  RESEARCH_KINDS,
  RESEARCH_KIND_LABEL,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABEL,
  type ResearchGender,
  type ResearchKind,
  type ResearchStatus,
} from "@/lib/research-types";
import { formatDateInput } from "@/lib/period";
import { cn } from "@/lib/utils";
import {
  createResearchItemAction,
  deleteResearchItemAction,
  updateResearchItemAction,
} from "./actions";

type FormState = {
  kind: ResearchKind;
  name: string;
  reach: string;
  activeDays: string;
  fbAdLink: string;
  storeLink: string;
  market: string;
  researchedAt: string;
  gender: ResearchGender;
  notes: string;
  angle: string;
  status: ResearchStatus;
};

function emptyForm(today = formatDateInput(new Date())): FormState {
  return {
    kind: "product",
    name: "",
    reach: "",
    activeDays: "",
    fbAdLink: "",
    storeLink: "",
    market: "",
    researchedAt: today,
    gender: "unknown",
    notes: "",
    angle: "",
    status: "new",
  };
}

function fromRow(row: ResearchItemView): FormState {
  return {
    kind: row.kind,
    name: row.name,
    reach: row.reach != null ? String(row.reach) : "",
    activeDays: row.activeDays != null ? String(row.activeDays) : "",
    fbAdLink: row.fbAdLink,
    storeLink: row.storeLink,
    market: row.market,
    researchedAt: row.researchedAtKey,
    gender: row.gender,
    notes: row.notes,
    angle: row.angle,
    status: row.status,
  };
}

function parseNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

function statusTone(status: ResearchStatus): string {
  switch (status) {
    case "winner":
      return "border-positive/30 bg-positive/10 text-positive";
    case "testing":
      return "border-accent/30 bg-accent/10 text-accent";
    case "shortlist":
      return "border-warning/30 bg-warning/10 text-warning";
    case "rejected":
      return "border-negative/30 bg-negative/10 text-negative";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function PesquisaClient({
  rows,
  canEdit,
  initialQ,
  initialKind,
  initialStatus,
}: {
  rows: ResearchItemView[];
  canEdit: boolean;
  initialQ: string;
  initialKind: ResearchKind | "all";
  initialStatus: ResearchStatus | "all";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState(initialQ);
  const [kindFilter, setKindFilter] = useState<ResearchKind | "all">(
    initialKind,
  );
  const [statusFilter, setStatusFilter] = useState<ResearchStatus | "all">(
    initialStatus,
  );

  const isEditing = Boolean(editingId);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function applyFilters(next?: {
    q?: string;
    kind?: ResearchKind | "all";
    status?: ResearchStatus | "all";
  }) {
    const params = new URLSearchParams();
    const nextQ = next?.q ?? q;
    const nextKind = next?.kind ?? kindFilter;
    const nextStatus = next?.status ?? statusFilter;
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextKind !== "all") params.set("kind", nextKind);
    if (nextStatus !== "all") params.set("status", nextStatus);
    const qs = params.toString();
    router.push(qs ? `/pesquisa?${qs}` : "/pesquisa");
  }

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setForm(emptyForm());
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const payload = {
      kind: form.kind,
      name: form.name,
      reach: parseNum(form.reach),
      activeDays: parseNum(form.activeDays),
      fbAdLink: form.fbAdLink,
      storeLink: form.storeLink,
      market: form.market,
      researchedAt: form.researchedAt || formatDateInput(new Date()),
      gender: form.gender,
      notes: form.notes,
      angle: form.angle,
      status: form.status,
    };
    if (editingId) {
      run(() => updateResearchItemAction({ id: editingId, ...payload }));
    } else {
      run(() => createResearchItemAction(payload));
    }
  }

  function startEdit(row: ResearchItemView) {
    setEditingId(row.id);
    setForm(fromRow(row));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.market) set.add(r.market);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt"));
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Product & Collection Research
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Biblioteca partilhada do workspace. A data preenche-se sozinha ao
          criar; podes alterar depois.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {canEdit && (
        <form
          onSubmit={submitForm}
          className="rounded-lg border border-border bg-surface p-4 sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {isEditing ? "Editar entrada" : "Nova entrada"}
            </h2>
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar edição
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Tipo</label>
              <select
                className={inputCls}
                value={form.kind}
                onChange={(e) =>
                  patchForm({ kind: e.target.value as ResearchKind })
                }
              >
                {RESEARCH_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {RESEARCH_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className={labelCls}>Nome</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="Produto ou coleção"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) =>
                  patchForm({ status: e.target.value as ResearchStatus })
                }
              >
                {RESEARCH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {RESEARCH_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Reach</label>
              <input
                className={cn(inputCls, "tabular-nums")}
                inputMode="numeric"
                value={form.reach}
                onChange={(e) => patchForm({ reach: e.target.value })}
                placeholder="ex. 250000"
              />
            </div>
            <div>
              <label className={labelCls}>Active Days</label>
              <input
                className={cn(inputCls, "tabular-nums")}
                inputMode="numeric"
                value={form.activeDays}
                onChange={(e) => patchForm({ activeDays: e.target.value })}
                placeholder="ex. 12"
              />
            </div>
            <div>
              <label className={labelCls}>Market</label>
              <input
                className={inputCls}
                list="research-markets"
                value={form.market}
                onChange={(e) => patchForm({ market: e.target.value })}
                placeholder="BE, FR, DE…"
              />
              <datalist id="research-markets">
                {markets.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select
                className={inputCls}
                value={form.gender}
                onChange={(e) =>
                  patchForm({ gender: e.target.value as ResearchGender })
                }
              >
                {(Object.keys(RESEARCH_GENDER_LABEL) as ResearchGender[]).map(
                  (g) => (
                    <option key={g} value={g}>
                      {RESEARCH_GENDER_LABEL[g]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Fb Ad Link</label>
              <input
                className={inputCls}
                value={form.fbAdLink}
                onChange={(e) => patchForm({ fbAdLink: e.target.value })}
                placeholder="https://facebook.com/ads/library/…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Store Link</label>
              <input
                className={inputCls}
                value={form.storeLink}
                onChange={(e) => patchForm({ storeLink: e.target.value })}
                placeholder="https://…"
              />
            </div>

            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                className={cn(inputCls, "tabular-nums")}
                value={form.researchedAt}
                onChange={(e) => patchForm({ researchedAt: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Ângulo / hook</label>
              <input
                className={inputCls}
                value={form.angle}
                onChange={(e) => patchForm({ angle: e.target.value })}
                placeholder="Ex. before/after, UGC, problema→solução"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className={labelCls}>Notes</label>
              <textarea
                className={cn(inputCls, "min-h-[72px] resize-y")}
                value={form.notes}
                onChange={(e) => patchForm({ notes: e.target.value })}
                placeholder="Observações, preço, fornecedor, ideias…"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isEditing ? "Guardar" : "Adicionar"}
            </button>
          </div>
        </form>
      )}

      {!canEdit && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Só consulta — precisas de papel editor ou superior para adicionar.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <label className={labelCls}>Pesquisar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={cn(inputCls, "pl-9")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters({ q });
              }}
              placeholder="Nome, market, notas…"
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select
            className={inputCls}
            value={kindFilter}
            onChange={(e) => {
              const v = e.target.value as ResearchKind | "all";
              setKindFilter(v);
              applyFilters({ kind: v });
            }}
          >
            <option value="all">Todos</option>
            {RESEARCH_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESEARCH_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <select
            className={inputCls}
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value as ResearchStatus | "all";
              setStatusFilter(v);
              applyFilters({ status: v });
            }}
          >
            <option value="all">Todos</option>
            {RESEARCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESEARCH_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => applyFilters()}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Filtrar
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} entrada{rows.length === 1 ? "" : "s"}
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Reach</th>
              <th className="px-4 py-3 text-right">Days</th>
              <th className="px-4 py-3">Market</th>
              <th className="px-4 py-3">Gender</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Links</th>
              <th className="px-4 py-3">Notes</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 11 : 10}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Ainda sem research. Adiciona a primeira entrada em cima.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-muted/60"
              >
                <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                  {row.researchedAtLabel}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{row.name}</p>
                  {row.angle && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.angle}
                    </p>
                  )}
                  {row.createdByName && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      por {row.createdByName}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.kindLabel}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.reach != null ? row.reach.toLocaleString("pt-PT") : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.activeDays != null ? row.activeDays : "—"}
                </td>
                <td className="px-4 py-3">{row.market || "—"}</td>
                <td className="px-4 py-3">{row.genderLabel}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                      statusTone(row.status),
                    )}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {row.fbAdLink ? (
                      <a
                        href={row.fbAdLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        FB <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {row.storeLink ? (
                      <a
                        href={row.storeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        Store <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </td>
                <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
                  <p className="line-clamp-2">{row.notes || "—"}</p>
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-border p-1.5 hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Apagar"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Apagar «${row.name}»? (soft delete)`,
                            )
                          ) {
                            return;
                          }
                          run(() => deleteResearchItemAction(row.id));
                        }}
                        className="rounded-lg border border-border p-1.5 text-negative hover:bg-negative/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {rows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
            Ainda sem research.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{row.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.kindLabel} · {row.researchedAtLabel}
                  {row.market ? ` · ${row.market}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                  statusTone(row.status),
                )}
              >
                {row.statusLabel}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Reach</p>
                <p className="tabular-nums">
                  {row.reach != null ? row.reach.toLocaleString("pt-PT") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Days</p>
                <p className="tabular-nums">{row.activeDays ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p>{row.genderLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ângulo</p>
                <p className="truncate">{row.angle || "—"}</p>
              </div>
            </div>

            {(row.fbAdLink || row.storeLink) && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {row.fbAdLink && (
                  <a
                    href={row.fbAdLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent"
                  >
                    FB Ad <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {row.storeLink && (
                  <a
                    href={row.storeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent"
                  >
                    Store <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}

            {row.notes && (
              <p className="mt-3 text-sm text-muted-foreground">{row.notes}</p>
            )}

            {canEdit && (
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-sm"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Apagar «${row.name}»?`)) return;
                    run(() => deleteResearchItemAction(row.id));
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-negative"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Atalho:{" "}
        <Link href="/operacao" className="text-accent hover:underline">
          Modo operação
        </Link>
      </p>
    </div>
  );
}
