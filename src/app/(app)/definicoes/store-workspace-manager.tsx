"use client";

import { useActionState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import {
  assignStoreWorkspaceAction,
  type SettingsState,
} from "./actions";

export type StoreWorkspaceRow = {
  id: string;
  name: string;
  shopDomain: string;
  displayUrl: string;
  workspaceId: string;
  workspaceName: string;
};

export type WorkspaceOption = { id: string; name: string };

function StoreWorkspaceAssignRow({
  store,
  workspaces,
}: {
  store: StoreWorkspaceRow;
  workspaces: WorkspaceOption[];
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    assignStoreWorkspaceAction,
    {},
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-t border-border px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="storeId" value={store.id} />
      <div className="min-w-0 flex-1">
        <Sensitive as="p" className="font-medium truncate">{store.name}</Sensitive>
        <Sensitive as="p" className="truncate text-xs text-muted-foreground">
          {store.displayUrl || store.shopDomain || "—"}
        </Sensitive>
        <p className="mt-1 text-xs text-muted-foreground">
          Agora em:{" "}
          <Sensitive as="span" className="font-medium text-foreground">
            {store.workspaceName}
          </Sensitive>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <select
          name="workspaceId"
          defaultValue={store.workspaceId}
          data-sensitive
          className="min-w-[10rem] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          <ArrowRightLeft className="h-4 w-4" />
          {pending ? "A mover…" : "Mover"}
        </button>
      </div>
      {state.error && (
        <p className="text-xs text-negative sm:w-full">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-xs text-positive sm:w-full">Loja movida.</p>
      )}
    </form>
  );
}

export function StoreWorkspaceManager({
  stores,
  workspaces,
}: {
  stores: StoreWorkspaceRow[];
  workspaces: WorkspaceOption[];
}) {
  if (stores.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        Ainda não tens lojas para organizar. Adiciona uma em Lojas.
      </p>
    );
  }

  if (workspaces.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">
          Cria outro workspace (menu superior) para poder mover lojas entre
          espaços. As tuas lojas ficam sempre num workspace.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {stores.map((s) => (
            <li key={s.id} className="flex justify-between gap-2">
              <Sensitive as="span" className="truncate font-medium">{s.name}</Sensitive>
              <Sensitive as="span" className="shrink-0 text-muted-foreground">
                {s.workspaceName}
              </Sensitive>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h3 className="font-semibold">Atribuir loja a workspace</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolhe o workspace de destino e clica em Mover. A loja só aparece no
          workspace onde está.
        </p>
      </div>
      <div>
        {stores.map((s) => (
          <StoreWorkspaceAssignRow
            key={s.id}
            store={s}
            workspaces={workspaces}
          />
        ))}
      </div>
    </div>
  );
}
