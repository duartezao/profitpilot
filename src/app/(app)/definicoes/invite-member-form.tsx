"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  inviteMemberAction,
  type InviteActionState,
} from "./invite-actions";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

const roleHelp: Record<string, string> = {
  admin: "Gere lojas, custos e definições (sem faturação nem equipa).",
  editor: "Edita COGS, notas e dados operacionais das lojas autorizadas.",
  viewer: "Só consulta dashboards — não altera nada.",
};

export function InviteMemberForm({
  stores,
}: {
  stores: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<InviteActionState, FormData>(
    inviteMemberAction,
    {},
  );

  function toggleStore(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <UserPlus className="h-4 w-4" />
          Convidar membro
        </button>
      ) : (
        <form
          action={action}
          className="space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Convidar para o workspace</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>

          {state.error && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
              Convite enviado. A pessoa verá o alerta em Definições ao iniciar
              sessão com esse email.
            </p>
          )}

          <div>
            <label className={labelCls} htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="colega@exemplo.com"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="invite-role">
              Papel
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="viewer"
              className={inputCls}
            >
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {roleHelp.viewer}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelCls}>Acesso às lojas</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="storeScope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Todas as lojas</span>
                <span className="block text-xs text-muted-foreground">
                  Inclui lojas que adicionares no futuro — acesso actualiza-se
                  automaticamente.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="storeScope"
                value="selected"
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Lojas específicas</span>
                <span className="block text-xs text-muted-foreground">
                  Só vê as lojas que seleccionares.
                </span>
              </span>
            </label>
          </fieldset>

          {scope === "selected" && (
            <div className="rounded-lg border border-border bg-background p-3">
              {stores.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há lojas neste workspace.
                </p>
              ) : (
                <ul className="max-h-40 space-y-2 overflow-y-auto">
                  {stores.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleStore(s.id)}
                        />
                        <span data-sensitive>{s.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <input
                type="hidden"
                name="storeIds"
                value={[...selected].join(",")}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={pending || (scope === "selected" && selected.size === 0)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "A enviar…" : "Enviar convite"}
          </button>
        </form>
      )}
    </div>
  );
}
