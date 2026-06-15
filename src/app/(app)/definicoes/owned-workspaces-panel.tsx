"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  renameWorkspaceAction,
  type WorkspaceActionState,
} from "@/app/(app)/workspaces/actions";
import { Sensitive } from "@/components/privacy-mode";
import type { OwnedWorkspaceRow } from "@/lib/workspaces";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const btnPrimary =
  "shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60";
const btnDanger =
  "inline-flex items-center gap-1.5 rounded-lg border border-negative/40 px-3 py-1.5 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-60";

function RenameRow({
  workspace,
}: {
  workspace: OwnedWorkspaceRow;
}) {
  const [name, setName] = useState(workspace.name);
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    renameWorkspaceAction,
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="workspaceId" value={workspace.id} />
      <label className="block text-xs font-medium text-muted-foreground">
        Nome
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          data-sensitive
          required
        />
        <button
          type="submit"
          disabled={pending || name.trim() === workspace.name}
          className={btnPrimary}
        >
          {pending ? "A guardar…" : "Guardar"}
        </button>
      </div>
      {state.error && <p className="text-xs text-negative">{state.error}</p>}
      {state.ok && (
        <p className="text-xs text-positive">Nome actualizado.</p>
      )}
    </form>
  );
}

function DeleteWorkspaceBlock({
  workspace,
}: {
  workspace: OwnedWorkspaceRow;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [ack, setAck] = useState(false);
  const [state, action, pending] = useActionState<WorkspaceActionState, FormData>(
    deleteWorkspaceAction,
    {},
  );

  const hasStores = workspace.storeCount > 0;
  const canSubmitDelete =
    !hasStores || (ack && confirmName.trim() === workspace.name);

  return (
    <div className="border-t border-border pt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={btnDanger}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Apagar workspace
        </button>
      ) : (
        <form
          action={action}
          className="space-y-3 rounded-lg border border-negative/30 bg-negative/5 p-3"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          {hasStores ? (
            <>
              <p className="text-sm text-foreground">
                Este workspace tem{" "}
                <strong>
                  {workspace.storeCount}{" "}
                  {workspace.storeCount === 1 ? "loja" : "lojas"}
                </strong>
                . As lojas serão arquivadas e deixarás de as ver.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="acknowledgeDataLoss"
                  value="true"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  Compreendo que todas as lojas e dados deste workspace serão
                  removidos da minha conta.
                </span>
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Escreve{" "}
                  <Sensitive as="span">{workspace.name}</Sensitive> para confirmar
                </label>
                <input
                  name="confirmName"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className={inputCls}
                  autoComplete="off"
                  data-sensitive
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem lojas associadas — o workspace será apagado de imediato.
            </p>
          )}
          {state.error && (
            <p className="text-sm text-negative">{state.error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !canSubmitDelete}
              className={btnDanger}
            >
              {pending
                ? "A apagar…"
                : hasStores
                  ? "Apagar definitivamente"
                  : "Apagar agora"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmName("");
                setAck(false);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  currentWorkspaceId,
}: {
  workspace: OwnedWorkspaceRow;
  currentWorkspaceId: string;
}) {
  const isActive = workspace.id === currentWorkspaceId;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Sensitive as="p" className="font-medium">
          {workspace.name}
        </Sensitive>
        <div className="flex flex-wrap items-center gap-2">
          {isActive && (
            <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Activo
            </span>
          )}
          <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
            {workspace.storeCount === 0
              ? "Sem lojas"
              : `${workspace.storeCount} ${workspace.storeCount === 1 ? "loja" : "lojas"}`}
          </span>
        </div>
      </div>
      <RenameRow workspace={workspace} />
      <DeleteWorkspaceBlock workspace={workspace} />
    </div>
  );
}

export function OwnedWorkspacesPanel({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: OwnedWorkspaceRow[];
  currentWorkspaceId: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createState, createAction, creating] = useActionState<
    WorkspaceActionState,
    FormData
  >(createWorkspaceAction, {});

  if (workspaces.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Só podes gerir workspaces de que és proprietário.
        </p>
        <form action={createAction} className="flex flex-col gap-2 sm:flex-row">
          <input
            name="name"
            placeholder="Nome do novo workspace"
            className={inputCls}
            required
          />
          <button type="submit" disabled={creating} className={btnPrimary}>
            {creating ? "A criar…" : "Criar workspace"}
          </button>
        </form>
        {createState.error && (
          <p className="text-sm text-negative">{createState.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workspaces.map((ws) => (
        <WorkspaceCard
          key={ws.id}
          workspace={ws}
          currentWorkspaceId={currentWorkspaceId}
        />
      ))}

      <div className="rounded-lg border border-dashed border-border p-4">
        {!showCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent"
          >
            <Plus className="h-4 w-4" />
            Novo workspace
          </button>
        ) : (
          <form action={createAction} className="space-y-3">
            {createState.error && (
              <p className="text-sm text-negative">{createState.error}</p>
            )}
            <input
              name="name"
              placeholder="Nome do workspace"
              className={inputCls}
              required
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={creating} className={btnPrimary}>
                {creating ? "A criar…" : "Criar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
