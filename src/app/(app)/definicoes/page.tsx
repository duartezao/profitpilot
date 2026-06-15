import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { getCurrentUser, listManageableWorkspaces } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { formatGlobalSyncInterval } from "@/lib/sync-config";
import { Workspace } from "@/models/Workspace";
import { Store } from "@/models/Store";
import { logoutAction } from "@/app/(app)/actions";
import { listWorkspaceMembers } from "@/lib/members";
import {
  listPendingInvitationsForEmail,
  listSentInvitationsForWorkspace,
} from "@/lib/invitations";
import { canManageMembers } from "@/lib/rbac";
import { WorkspaceForm } from "./workspace-form";
import { StoreSettingsForm } from "./store-settings-form";
import { StoreWorkspaceManager } from "./store-workspace-manager";
import { TeamMembers } from "./team-members";
import { PendingInvitations } from "./pending-invitations";
import { normalizeSessionCountry } from "@/lib/shopify-countries";
import { getStoreDisplayUrl } from "@/lib/store-display";

export const metadata: Metadata = { title: "Definições" };

const roleLabel: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

export default async function DefinicoesPage() {
  const user = await getCurrentUser();
  await connectToDatabase();

  const workspace = user?.workspaceId
    ? await Workspace.findById(user.workspaceId).lean()
    : null;
  const stores = await Store.find({
    workspaceId: user?.workspaceId,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const canEditWorkspace = ["owner", "admin"].includes(user?.role ?? "");
  const canEditStores = ["owner", "admin", "editor"].includes(user?.role ?? "");
  const canManageTeam = canManageMembers(user?.role ?? "");
  const globalSyncLabel = formatGlobalSyncInterval();
  const canAssignStores = canEditWorkspace;

  const manageableWorkspaces = user
    ? await listManageableWorkspaces(user.id)
    : [];
  const manageableIds = manageableWorkspaces.map((w) => w.id);

  const allManageableStores =
    manageableIds.length > 0
      ? await Store.find({
          workspaceId: { $in: manageableIds },
          deletedAt: null,
        })
          .sort({ name: 1 })
          .lean()
      : [];

  const wsNameById = new Map(
    manageableWorkspaces.map((w) => [w.id, w.name]),
  );

  const storeWorkspaceRows = allManageableStores.map((s) => ({
    id: String(s._id),
    name: s.name,
    shopDomain: s.shopDomain ?? "",
    displayUrl: getStoreDisplayUrl(s) ?? "",
    workspaceId: String(s.workspaceId),
    workspaceName: wsNameById.get(String(s.workspaceId)) ?? "—",
  }));

  const workspaceOptions = manageableWorkspaces.map((w) => ({
    id: w.id,
    name: w.name,
  }));

  const teamMembers = user?.workspaceId
    ? await listWorkspaceMembers(user.workspaceId, user.id)
    : [];

  const pendingInvitations = user?.email
    ? await listPendingInvitationsForEmail(user.email)
    : [];

  const sentInvitations =
    canManageTeam && user?.workspaceId
      ? await listSentInvitationsForWorkspace(user.workspaceId)
      : [];

  const inviteStores = stores.map((s) => ({
    id: String(s._id),
    name: s.name,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
        <p className="text-sm text-muted-foreground">
          Conta, workspace e configuração das lojas.
        </p>
      </div>

      {/* Conta */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Conta</h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-5">
          <div>
            <p className="font-medium" data-sensitive>{user?.name}</p>
            <p className="text-sm text-muted-foreground" data-sensitive>{user?.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {roleLabel[user?.role ?? "viewer"]} ·{" "}
              <span data-sensitive>{user?.workspaceName}</span>
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Terminar sessão
            </button>
          </form>
        </div>
      </section>

      <PendingInvitations invitations={pendingInvitations} />

      {/* Workspace */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Workspace</h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          <WorkspaceForm
            canEdit={canEditWorkspace}
            values={{
              name: workspace?.name ?? "",
              baseCurrency: workspace?.baseCurrency ?? "EUR",
              taxReservePercent: workspace?.taxReservePercent ?? 0,
              netMarginMin: workspace?.targets?.netMarginMin ?? 15,
              refundRateMax: workspace?.targets?.refundRateMax ?? 5,
              chargebackRateMax: workspace?.targets?.chargebackRateMax ?? 1,
            }}
          />
        </div>
      </section>

      {/* Equipa */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Equipa</h2>
          <p className="text-sm text-muted-foreground">
            {canManageTeam
              ? "Convida membros, define papéis e que lojas podem ver."
              : "Membros com acesso a este workspace. Só o proprietário gere permissões."}
          </p>
        </div>
        <TeamMembers
          members={teamMembers}
          actorRole={user?.role ?? "viewer"}
          actorUserId={user?.id ?? ""}
          canManage={canManageTeam}
          stores={inviteStores}
          sentInvitations={sentInvitations}
        />
      </section>

      {/* Organizar lojas por workspace */}
      {canAssignStores && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Lojas por workspace</h2>
          <StoreWorkspaceManager
            stores={storeWorkspaceRows}
            workspaces={workspaceOptions}
          />
        </section>
      )}

      {/* Lojas do workspace atual */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Lojas · {workspace?.name ?? "workspace"}
        </h2>
        {stores.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
            Ainda não tens lojas. Adiciona uma em Lojas.
          </p>
        ) : (
          <div className="space-y-4">
            {stores.map((s) => (
              <StoreSettingsForm
                key={String(s._id)}
                canEdit={canEditStores}
                globalSyncLabel={globalSyncLabel}
                store={{
                  id: String(s._id),
                  name: s.name,
                  shopDomain: s.shopDomain ?? "",
                  displayUrl: getStoreDisplayUrl(s) ?? "",
                  currency: s.currency ?? "EUR",
                  status: (s.status ?? "active") as
                    | "active"
                    | "paused"
                    | "archived",
                  autoSync: s.autoSync ?? true,
                  processingPercent: s.feeConfig?.processingPercent ?? 0,
                  processingFixed: s.feeConfig?.processingFixed ?? 0,
                  transactionFeePercent: s.feeConfig?.transactionFeePercent ?? 0,
                  startingBalance: s.startingBalance ?? 0,
                  startingBalanceDate: s.startingBalanceDate
                    ? new Date(s.startingBalanceDate).toISOString().slice(0, 10)
                    : "",
                  analyticsSessionCountry:
                    normalizeSessionCountry(s.analyticsSessionCountry) ?? "",
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
