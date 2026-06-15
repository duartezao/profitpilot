"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { WorkspaceMemberView } from "@/lib/members";
import {
  updateMemberStoreAccessAction,
  type MemberActionState,
} from "./members-actions";

export function MemberStoreAccessEditor({
  member,
  stores,
}: {
  member: WorkspaceMemberView;
  stores: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const initialScope: "all" | "selected" =
    member.storeAccess === "all" ? "all" : "selected";
  const [scope, setScope] = useState<"all" | "selected">(initialScope);
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        member.storeAccess === "all" ? [] : [...member.storeAccess],
      ),
  );
  const [state, action, pending] = useActionState<
    MemberActionState,
    FormData
  >(updateMemberStoreAccessAction, {});

  function toggleStore(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <Pencil className="h-3 w-3" />
        Editar
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
      <input type="hidden" name="membershipId" value={member.membershipId} />
      <input
        type="hidden"
        name="storeIds"
        value={scope === "all" ? "" : [...selected].join(",")}
      />
      <input type="hidden" name="storeScope" value={scope} />

      <p className="text-xs font-medium">Acesso às lojas</p>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="radio"
          name="storeScopeUi"
          checked={scope === "all"}
          onChange={() => setScope("all")}
        />
        Todas as lojas
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="radio"
          name="storeScopeUi"
          checked={scope === "selected"}
          onChange={() => setScope("selected")}
        />
        Lojas específicas
      </label>

      {scope === "selected" && (
        <div className="max-h-32 space-y-1 overflow-y-auto pl-4">
          {stores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleStore(s.id)}
              />
              <Sensitive>{s.name}</Sensitive>
            </label>
          ))}
        </div>
      )}

      {state.error && (
        <p className="text-xs text-negative">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-xs text-positive">Acesso atualizado.</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || (scope === "selected" && selected.size === 0)}
          className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-60"
        >
          {pending ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Fechar
        </button>
      </div>
    </form>
  );
}
