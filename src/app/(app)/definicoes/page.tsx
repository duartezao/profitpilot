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
  listPendingInvitationsForUser,
  listSentInvitationsForWorkspace,
} from "@/lib/invitations";
import { canManageMembers } from "@/lib/rbac";
import { WorkspaceForm } from "./workspace-form";
import { StoreSettingsForm } from "./store-settings-form";
import { StoreWorkspaceManager } from "./store-workspace-manager";
import { CashInjectionPanel } from "./cash-injection-panel";
import { TeamMembers } from "./team-members";
import { PendingInvitations } from "./pending-invitations";
import { normalizeSessionCountry } from "@/lib/shopify-countries";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { canAccessStore } from "@/lib/store-access";
import type { CogsMode } from "@/lib/cogs-modes";
import { listCashEntriesForWorkspace } from "@/lib/cash-entries";
import { FeeSchedulePanel } from "./fee-schedule-panel";
import { OwnedWorkspacesPanel } from "./owned-workspaces-panel";
import { StoreSettingsBlock } from "./store-settings-block";
import { SettingsCollapsibleSection } from "@/components/settings-collapsible-section";
import { SettingsNav } from "@/components/settings-nav";
import {
  buildFeeScheduleViews,
  ensureFeeSchedule,
  formatFeeConfigLabel,
  resolveFeeConfigForDateKey,
  type FeeScheduleEntry,
} from "@/lib/fee-schedule";
import {
  dateKeyInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { listOwnedWorkspacesForUser } from "@/lib/workspaces";

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

  const pendingInvitations = user
    ? await listPendingInvitationsForUser({
        email: user.email,
        username: user.username,
      })
    : [];

  const sentInvitations =
    canManageTeam && user?.workspaceId
      ? await listSentInvitationsForWorkspace(user.workspaceId)
      : [];

  const inviteStores = stores.map((s) => ({
    id: String(s._id),
    name: s.name,
  }));

  const cashStores = stores
    .filter((s) => canAccessStore(user?.storeAccess ?? "all", String(s._id)))
    .map((s) => ({
      id: String(s._id),
      name: s.name,
      currency: s.currency ?? workspace?.baseCurrency ?? "EUR",
    }));

  const storeNameById = new Map(stores.map((s) => [String(s._id), s.name]));

  const cashEntries =
    user?.workspaceId && cashStores.length > 0
      ? (
          await listCashEntriesForWorkspace(user.workspaceId, {
            storeIds: cashStores.map((s) => s.id),
            limit: 50,
          })
        ).map((e) => ({
          ...e,
          storeName: storeNameById.get(e.storeId) ?? "—",
        }))
      : [];

  const ownedWorkspaces = user ? await listOwnedWorkspacesForUser(user.id) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
        <p className="text-sm text-muted-foreground">
          Conta, workspaces, equipa e configuração das lojas — abre só o que
          precisares.
        </p>
      </div>

      <SettingsNav
        showInvites={pendingInvitations.length > 0}
        showMoveStores={canAssignStores}
      />

      <SettingsCollapsibleSection id="conta" title="Conta">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted sm:w-auto"
            >
              <LogOut className="h-4 w-4" />
              Terminar sessão
            </button>
          </form>
        </div>
      </SettingsCollapsibleSection>

      {pendingInvitations.length > 0 && (
        <SettingsCollapsibleSection
          id="convites"
          title="Convites pendentes"
          badge={
            <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {pendingInvitations.length}
            </span>
          }
        >
          <PendingInvitations invitations={pendingInvitations} embedded />
        </SettingsCollapsibleSection>
      )}

      <SettingsCollapsibleSection
        id="meus-workspaces"
        title="Os teus workspaces"
        description="Cria, renomeia ou apaga workspaces de que és proprietário. Sem lojas apaga de imediato; com lojas é preciso confirmação dupla."
      >
        <OwnedWorkspacesPanel
          workspaces={ownedWorkspaces}
          currentWorkspaceId={user?.workspaceId ?? ""}
        />
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        id="workspace-activo"
        title="Workspace activo"
        description="Moeda base, metas e impostos do workspace que estás a ver agora (sessão)."
      >
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
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        id="equipa"
        title="Equipa"
        description={
          canManageTeam
            ? "Convida membros, define papéis e que lojas podem ver."
            : "Membros com acesso a este workspace. Só o proprietário gere permissões."
        }
      >
        <TeamMembers
          members={teamMembers}
          actorRole={user?.role ?? "viewer"}
          actorUserId={user?.id ?? ""}
          canManage={canManageTeam}
          stores={inviteStores}
          sentInvitations={sentInvitations}
        />
      </SettingsCollapsibleSection>

      {canAssignStores && (
        <SettingsCollapsibleSection
          id="lojas-workspaces"
          title="Mover lojas entre workspaces"
          description="Reorganiza lojas entre workspaces que geres."
        >
          <StoreWorkspaceManager
            stores={storeWorkspaceRows}
            workspaces={workspaceOptions}
          />
        </SettingsCollapsibleSection>
      )}

      <SettingsCollapsibleSection
        id="lojas"
        title={
          <>
            Lojas ·{" "}
            <span data-sensitive>{workspace?.name ?? "workspace"}</span>
          </>
        }
        description="Nome, sync, banca inicial, país das sessões, COGS e taxas — uma secção por loja."
        badge={
          stores.length > 0 ? (
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {stores.length} {stores.length === 1 ? "loja" : "lojas"}
            </span>
          ) : undefined
        }
      >
        {stores.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Ainda não tens lojas. Adiciona uma em Lojas.
          </p>
        ) : (
          <div className="space-y-3">
            {stores.map((s) => {
              const tz = normalizeStoreTimezone(s.ianaTimezone);
              const floorKey =
                importDateKey(s.importStartDate, s.createdAt, tz) ??
                dateKeyInTimezone(new Date(s.createdAt ?? Date.now()), tz);
              const schedule = ensureFeeSchedule(
                s.feeSchedule as FeeScheduleEntry[] | undefined,
                s.feeConfig,
                floorKey,
              );
              const currency = s.currency ?? workspace?.baseCurrency ?? "EUR";
              const todayKey = dateKeyInTimezone(new Date(), tz);
              const currentFee = resolveFeeConfigForDateKey(
                schedule,
                s.feeConfig,
                todayKey,
                floorKey,
              );
              const latest = schedule[schedule.length - 1]!;
              const status = (s.status ?? "active") as
                | "active"
                | "paused"
                | "archived";

              return (
                <StoreSettingsBlock
                  key={String(s._id)}
                  storeName={s.name}
                  displayUrl={getStoreDisplayUrl(s) ?? s.shopDomain ?? ""}
                  status={status}
                >
                  <StoreSettingsForm
                    canEdit={canEditStores}
                    globalSyncLabel={globalSyncLabel}
                    store={{
                      id: String(s._id),
                      name: s.name,
                      shopDomain: s.shopDomain ?? "",
                      displayUrl: getStoreDisplayUrl(s) ?? "",
                      currency,
                      status,
                      autoSync: s.autoSync ?? true,
                      startingBalance: s.startingBalance ?? 0,
                      startingBalanceDate: s.startingBalanceDate
                        ? new Date(s.startingBalanceDate).toISOString().slice(0, 10)
                        : "",
                      analyticsSessionCountry:
                        normalizeSessionCountry(s.analyticsSessionCountry) ?? "",
                      cogsMode: (s.cogsMode ?? "shopify") as CogsMode,
                      cogsInputCurrency: s.cogsInputCurrency ?? "EUR",
                    }}
                  />
                  <FeeSchedulePanel
                    storeId={String(s._id)}
                    canEdit={canEditStores}
                    importStartDateKey={floorKey}
                    entries={buildFeeScheduleViews(schedule, currency)}
                    currentLabel={formatFeeConfigLabel(currentFee, currency)}
                    defaultProcessingPercent={latest.processingPercent}
                    defaultProcessingFixed={latest.processingFixed}
                    defaultTransactionFeePercent={latest.transactionFeePercent}
                  />
                </StoreSettingsBlock>
              );
            })}
          </div>
        )}
      </SettingsCollapsibleSection>

      {cashStores.length > 0 && (
        <SettingsCollapsibleSection
          id="capital-negocio"
          title="Capital no negócio"
          description="Depósitos e levantamentos de caixa — separado do saldo inicial de cada loja."
        >
          <CashInjectionPanel
            stores={cashStores}
            entries={cashEntries}
            canEdit={canEditStores}
            embedded
          />
        </SettingsCollapsibleSection>
      )}
    </div>
  );
}
