"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import {
  ACCESS_VAULT_CATEGORIES,
  ACCESS_VAULT_CATEGORY_LABELS,
  type AccessVaultCategory,
  type AccessVaultRow,
} from "@/lib/access-vault";
import {
  addAccessVaultEntryAction,
  deleteAccessVaultEntryAction,
  updateAccessVaultEntryAction,
  type AccessVaultActionState,
} from "@/app/(app)/definicoes/access-vault-actions";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

type StoreOption = { id: string; name: string };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <span className="text-[10px] font-medium text-positive">OK</span>
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function SecretField({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  if (!value) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Sensitive
        as="span"
        className={cn(
          "min-w-0 flex-1 truncate text-sm tabular-nums",
          !visible && "tracking-widest",
        )}
      >
        {visible ? value : "••••••••"}
      </Sensitive>
      <button
        type="button"
        aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`}
        onClick={() => setVisible((v) => !v)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
      >
        {visible ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function AccessVaultForm({
  stores,
  initial,
  onCancel,
}: {
  stores: StoreOption[];
  initial?: AccessVaultRow;
  onCancel?: () => void;
}) {
  const action = initial
    ? updateAccessVaultEntryAction
    : addAccessVaultEntryAction;
  const [state, formAction, pending] = useActionState<
    AccessVaultActionState,
    FormData
  >(action, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onCancel?.();
    }
  }, [state.ok, router, onCancel]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      {initial && (
        <input type="hidden" name="entryId" value={initial.id} />
      )}
      <p className="text-sm font-medium">
        {initial ? "Editar acesso" : "Novo acesso"}
      </p>

      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          {initial ? "Acesso actualizado." : "Acesso guardado."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Tipo</label>
          <select
            name="category"
            defaultValue={initial?.category ?? "shopify"}
            className={inputCls}
            required
          >
            {ACCESS_VAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ACCESS_VAULT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Loja (opcional)</label>
          <select
            name="storeId"
            defaultValue={initial?.storeId ?? ""}
            className={inputCls}
            data-sensitive
          >
            <option value="">Todo o workspace</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Nome / descrição</label>
          <input
            name="title"
            type="text"
            required
            maxLength={120}
            defaultValue={initial?.title ?? ""}
            placeholder="Ex.: Meta Business Manager"
            className={inputCls}
            data-sensitive
          />
        </div>
        <div>
          <label className={labelCls}>Utilizador / email</label>
          <input
            name="username"
            type="text"
            autoComplete="off"
            defaultValue={initial?.username ?? ""}
            placeholder="conta@exemplo.com"
            className={inputCls}
            data-sensitive
          />
        </div>
        <div>
          <label className={labelCls}>Palavra-passe</label>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            defaultValue={initial?.password ?? ""}
            className={inputCls}
            data-sensitive
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>URL (opcional)</label>
          <input
            name="url"
            type="url"
            inputMode="url"
            defaultValue={initial?.url ?? ""}
            placeholder="https://…"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notas (opcional)</label>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={initial?.notes ?? ""}
            className={`${inputCls} resize-y`}
            data-sensitive
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "A guardar…" : initial ? "Guardar" : "Adicionar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function DeleteAccessButton({ entryId, title }: { entryId: string; title: string }) {
  const [state, action, pending] = useActionState<
    AccessVaultActionState,
    FormData
  >(deleteAccessVaultEntryAction, {});

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Remover o acesso «${title}»? Os sócios deixam de o ver neste workspace.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-50"
        aria-label="Remover acesso"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {state.error && (
        <p className="mt-1 text-xs text-negative">{state.error}</p>
      )}
    </form>
  );
}

function AccessVaultCard({
  entry,
  canEdit,
  onEdit,
}: {
  entry: AccessVaultRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {entry.categoryLabel}
            {entry.storeName ? (
              <>
                {" · "}
                <Sensitive as="span">{entry.storeName}</Sensitive>
              </>
            ) : null}
          </p>
          <Sensitive as="h3" className="mt-0.5 truncate text-sm font-semibold">
            {entry.title}
          </Sensitive>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              aria-label="Editar acesso"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <DeleteAccessButton entryId={entry.id} title={entry.title} />
          </div>
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Utilizador</dt>
          <dd className="mt-0.5">
            <SecretField value={entry.username} label="utilizador" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Palavra-passe</dt>
          <dd className="mt-0.5">
            <SecretField value={entry.password} label="palavra-passe" />
          </dd>
        </div>
        {entry.url ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">URL</dt>
            <dd className="mt-0.5 truncate">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {entry.url}
              </a>
            </dd>
          </div>
        ) : null}
        {entry.notes ? (
          <div>
            <dt className="text-xs text-muted-foreground">Notas</dt>
            <dd className="mt-0.5">
              <Sensitive as="p" className="whitespace-pre-wrap text-sm">
                {entry.notes}
              </Sensitive>
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export function AccessVaultPanel({
  entries,
  stores,
  canEdit,
}: {
  entries: AccessVaultRow[];
  stores: StoreOption[];
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<AccessVaultCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  const editing = editingId
    ? entries.find((e) => e.id === editingId)
    : undefined;

  return (
    <section id="acessos-equipa" className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Cofre de acessos</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Guarda palavras-passe partilhadas do workspace (Shopify, banco, ads,
          fornecedores…). Encriptadas na base de dados — visíveis a todos os
          membros deste workspace.
          {!canEdit && " Só proprietário, admin ou editor podem adicionar."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs font-medium",
            filter === "all"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          Todos ({entries.length})
        </button>
        {ACCESS_VAULT_CATEGORIES.map((c) => {
          const count = entries.filter((e) => e.category === c).length;
          if (count === 0) return null;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium",
                filter === c
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {ACCESS_VAULT_CATEGORY_LABELS[c]} ({count})
            </button>
          );
        })}
      </div>

      {canEdit && !showForm && !editing && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-accent/40 hover:text-accent sm:w-auto"
        >
          Adicionar acesso
        </button>
      )}

      {showForm && !editing && (
        <AccessVaultForm
          stores={stores}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editing && (
        <AccessVaultForm
          stores={stores}
          initial={editing}
          onCancel={() => setEditingId(null)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {entries.length === 0
            ? "Ainda não há acessos guardados neste workspace."
            : "Nenhum acesso neste filtro."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((entry) => (
            <AccessVaultCard
              key={entry.id}
              entry={entry}
              canEdit={canEdit}
              onEdit={() => {
                setShowForm(false);
                setEditingId(entry.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
