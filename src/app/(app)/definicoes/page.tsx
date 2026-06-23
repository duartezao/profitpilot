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
import { canManageMembers, canInviteMembers } from "@/lib/rbac";
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
import { StoreDataPanel } from "./store-data-panel";
import { SettingsCollapsibleSection } from "@/components/settings-collapsible-section";
import { SettingsNav } from "@/components/settings-nav";
import {
  buildFeeScheduleViews,
  ensureFeeSchedule,
  formatFeeConfigLabel,
  normalizeFeeConfig,
  resolveFeeConfigForDateKey,
  shopifyCurrencyConversionPercent,
  type FeeScheduleEntry,
} from "@/lib/fee-schedule";
import {
  dateKeyInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { listOwnedWorkspacesForUser } from "@/lib/workspaces";
import { TEAM_INVITES_ENABLED, TEAM_MEMBERSHIP_ENABLED } from "@/lib/feature-flags";
import {
  getWorkspaceOwnerView,
  syncWorkspaceOwnerMembership,
} from "@/lib/workspace-ownership";
import { InviteMemberForm } from "./invite-member-form";
import { SentInvitations } from "./sent-invitations";

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
  const isWorkspaceOwner =
    Boolean(user?.id && workspace?.ownerId) &&
    String(workspace!.ownerId) === user!.id;
  const canManageTeam = canManageMembers(user?.role ?? "", isWorkspaceOwner);
  const canInvite = canInviteMembers(user?.role ?? "", isWorkspaceOwner);
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

  if (user?.workspaceId && TEAM_MEMBERSHIP_ENABLED) {
    await syncWorkspaceOwnerMembership(user.workspaceId);
  }

  const workspaceOwner =
    user?.workspaceId && TEAM_MEMBERSHIP_ENABLED
      ? await getWorkspaceOwnerView(user.workspaceId)
      : null;

  const teamMembers =
    TEAM_MEMBERSHIP_ENABLED && user?.workspaceId
      ? await listWorkspaceMembers(
          user.workspaceId,
          user.id,
          workspace?.ownerId ? String(workspace.ownerId) : null,
        )
      : [];

  const pendingInvitations =
    TEAM_INVITES_ENABLED && user
      ? await listPendingInvitationsForUser({
          id: user.id,
          email: user.email,
          username: user.username,
        })
      : [];

  const sentInvitations =
    TEAM_INVITES_ENABLED && canInvite && user?.workspaceId
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
          Conta, workspaces e configuração das lojas — abre só o que precisares.
        </p>
      </div>

      <SettingsNav
        showInvites={TEAM_INVITES_ENABLED && pendingInvitations.length > 0}
        showSendInvites={TEAM_INVITES_ENABLED && canInvite}
        showMoveStores={canAssignStores}
        showTeam={TEAM_MEMBERSHIP_ENABLED}
      />

      <SettingsCollapsibleSection id="conta" title="Conta">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium" data-sensitive>{user?.name}</p>
            <p className="text-sm text-muted-foreground" data-sensitive>{user?.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {TEAM_MEMBERSHIP_ENABLED ? (
                <>
                  {roleLabel[user?.role ?? "viewer"]} ·{" "}
                  <span data-sensitive>{user?.workspaceName}</span>
                </>
              ) : (
                <span data-sensitive>{user?.workspaceName}</span>
              )}
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

      {TEAM_INVITES_ENABLED && pendingInvitations.length > 0 && (
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
            poasMin: workspace?.targets?.poasMin ?? 1,
            monthlyRevenueGoal: workspace?.targets?.monthlyRevenueGoal ?? 0,
            monthlyProfitGoal: workspace?.targets?.monthlyProfitGoal ?? 0,
            refundWindowDays: workspace?.refundWindowDays ?? 30,
          }}
        />
      </SettingsCollapsibleSection>

      {TEAM_INVITES_ENABLED && canInvite && !TEAM_MEMBERSHIP_ENABLED && (
        <SettingsCollapsibleSection
          id="convidar"
          title="Convidar membros"
          description="Envia convites por email ou utilizador. A pessoa vê o pedido em Definições ao iniciar sessão."
          defaultOpen
        >
          <InviteMemberForm stores={inviteStores} />
          <SentInvitations invitations={sentInvitations} />
        </SettingsCollapsibleSection>
      )}

      {TEAM_MEMBERSHIP_ENABLED && (
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
            isWorkspaceOwner={isWorkspaceOwner}
            workspaceOwner={workspaceOwner}
            stores={inviteStores}
            sentInvitations={sentInvitations}
          />
        </SettingsCollapsibleSection>
      )}

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
              const baseCurrency = workspace?.baseCurrency ?? "EUR";
              const conversionPercent = shopifyCurrencyConversionPercent(
                currency,
                baseCurrency,
              );
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

              const initialFeeEntry =
                schedule.find((e) => e.effectiveFromKey === floorKey) ??
                schedule[0]!;
              const importStartDateStr = s.importStartDate
                ? new Date(s.importStartDate).toISOString().slice(0, 10)
                : floorKey;

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
                    baseCurrency={baseCurrency}
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
                    entries={buildFeeScheduleViews(
                      schedule,
                      currency,
                      conversionPercent,
                    )}
                    currentLabel={formatFeeConfigLabel(
                      currentFee,
                      currency,
                      conversionPercent,
                    )}
                    currencyConversionPercent={conversionPercent}
                    defaultProcessingPercent={latest.processingPercent}
                    defaultProcessingFixed={latest.processingFixed}
                    defaultTransactionFeePercent={latest.transactionFeePercent}
                  />
                  <StoreDataPanel
                    storeId={String(s._id)}
                    storeName={s.name}
                    importStartDate={importStartDateStr}
                    importFloorKey={floorKey}
                    initialFees={normalizeFeeConfig(initialFeeEntry)}
                    canEdit={canEditStores}
                    canDelete={canEditWorkspace}
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
