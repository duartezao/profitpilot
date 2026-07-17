import type { Metadata } from "next";
import { Suspense } from "react";
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
import { sessionCountryKeysFromStore } from "@/lib/shopify-countries";
import { hasOrdersInSecondarySessionCountry } from "@/lib/session-cogs-policy";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { canAccessStore } from "@/lib/store-access";
import type { CogsMode } from "@/lib/cogs-modes";
import { listCashEntriesForWorkspace } from "@/lib/cash-entries";
import { FeeSchedulePanel } from "./fee-schedule-panel";
import { OwnedWorkspacesPanel } from "./owned-workspaces-panel";
import { StoreSettingsBlock } from "./store-settings-block";
import { StoreDataPanel } from "./store-data-panel";
import { ShippingCountriesBackfillPanel } from "@/components/settings/shipping-countries-backfill-panel";
import {
  appliesAutoEuCustomsFees,
  countMissingEuCustomsOrdersWithoutCountry,
} from "@/lib/eu-category-fees";
import { DefinicoesTabs } from "@/components/settings/definicoes-tabs";
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
import { listWorkspaceGoogleLogins } from "@/lib/ad-platform-credentials";
import { GoogleWorkspaceLoginsPanel } from "@/components/settings/google-workspace-logins-panel";

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
  const googleLogins = user?.workspaceId
    ? await listWorkspaceGoogleLogins(user.workspaceId)
    : [];
  const canEditAds =
    Boolean(user) && ["owner", "admin", "editor"].includes(user!.role);

  const missingShippingByStore = new Map<string, number>();
  await Promise.all(
    stores.map(async (s) => {
      const mode = (s.cogsMode ?? "shopify") as CogsMode;
      if (!appliesAutoEuCustomsFees(mode)) return;
      const count = await countMissingEuCustomsOrdersWithoutCountry(s._id);
      missingShippingByStore.set(String(s._id), count);
    }),
  );

  const forceDayCogsByStore = new Map<string, boolean>();
  await Promise.all(
    stores.map(async (s) => {
      const countries = sessionCountryKeysFromStore(s);
      const force = await hasOrdersInSecondarySessionCountry(s._id, countries);
      forceDayCogsByStore.set(String(s._id), force);
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
        <p className="text-sm text-muted-foreground">
          Conta, workspaces e configuração das lojas.
        </p>
      </div>

      <DefinicoesTabs
        showEquipa={
          TEAM_MEMBERSHIP_ENABLED ||
          (TEAM_INVITES_ENABLED && (pendingInvitations.length > 0 || canInvite))
        }
        storeCount={stores.length}
        pendingInviteCount={pendingInvitations.length}
        panels={{
          conta: (
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
          ),
          workspace: (
            <>
              <section id="meus-workspaces">
                <h3 className="text-sm font-semibold">Os teus workspaces</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cria, renomeia ou apaga workspaces de que és proprietário.
                </p>
                <div className="mt-4">
                  <OwnedWorkspacesPanel
                    workspaces={ownedWorkspaces}
                    currentWorkspaceId={user?.workspaceId ?? ""}
                  />
                </div>
              </section>
              <section id="workspace-activo">
                <h3 className="text-sm font-semibold">Workspace activo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Moeda base, metas e impostos do workspace que estás a ver agora.
                </p>
                <div className="mt-4">
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
                </div>
              </section>
              {canAssignStores && (
                <section id="lojas-workspaces">
                  <h3 className="text-sm font-semibold">Mover lojas entre workspaces</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Reorganiza lojas entre workspaces que geres.
                  </p>
                  <div className="mt-4">
                    <StoreWorkspaceManager
                      stores={storeWorkspaceRows}
                      workspaces={workspaceOptions}
                    />
                  </div>
                </section>
              )}
            </>
          ),
          equipa: (
            <div className="space-y-6">
              {TEAM_INVITES_ENABLED && pendingInvitations.length > 0 && (
                <section id="convites">
                  <h3 className="text-sm font-semibold">Convites pendentes</h3>
                  <div className="mt-4">
                    <PendingInvitations invitations={pendingInvitations} embedded />
                  </div>
                </section>
              )}
              {TEAM_INVITES_ENABLED && canInvite && !TEAM_MEMBERSHIP_ENABLED && (
                <section id="convidar">
                  <h3 className="text-sm font-semibold">Convidar membros</h3>
                  <div className="mt-4 space-y-4">
                    <InviteMemberForm stores={inviteStores} />
                    <SentInvitations invitations={sentInvitations} />
                  </div>
                </section>
              )}
              {TEAM_MEMBERSHIP_ENABLED && (
                <section id="equipa">
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
                </section>
              )}
            </div>
          ),
          lojas:
            stores.length === 0 ? (
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
                  const cogsMode = (s.cogsMode ?? "shopify") as CogsMode;
                  const missingShippingCountries =
                    missingShippingByStore.get(String(s._id)) ?? 0;

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
                          analyticsSessionCountries:
                            sessionCountryKeysFromStore(s),
                          forceDayCogs:
                            forceDayCogsByStore.get(String(s._id)) ?? false,
                          cogsDayFromKey: s.cogsDayFromKey ?? null,
                          cogsMode,
                          cogsInputCurrency: s.cogsInputCurrency ?? "EUR",
                          externalGatewayPayoutBusinessDays:
                            s.externalGatewayPayoutBusinessDays ?? null,
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
                      {canEditStores && (
                        <ShippingCountriesBackfillPanel
                          storeId={String(s._id)}
                          missingCountryOrders={missingShippingCountries}
                        />
                      )}
                      <StoreDataPanel
                        storeId={String(s._id)}
                        storeName={s.name}
                        importStartDate={importStartDateStr}
                        importFloorKey={floorKey}
                        initialFees={normalizeFeeConfig(initialFeeEntry)}
                        timezone={tz}
                        timezoneSource={
                          s.timezoneSource === "manual" ? "manual" : "shopify"
                        }
                        canEdit={canEditStores}
                        canDelete={canEditWorkspace}
                      />
                    </StoreSettingsBlock>
                  );
                })}
              </div>
            ),
          integracoes: (
            <>
              <section id="google-ads">
                <h3 className="text-sm font-semibold">Google Ads</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Autoriza cada Gmail uma vez — nas lojas só escolhes Gmail + Customer ID.
                </p>
                <div className="mt-4">
                  <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
                    <GoogleWorkspaceLoginsPanel
                      logins={googleLogins}
                      canEdit={canEditAds}
                    />
                  </Suspense>
                </div>
              </section>
              {cashStores.length > 0 && (
                <section id="capital-negocio">
                  <h3 className="text-sm font-semibold">Capital no negócio</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Depósitos e levantamentos de caixa — separado do saldo inicial de cada loja.
                  </p>
                  <div className="mt-4">
                    <CashInjectionPanel
                      stores={cashStores}
                      entries={cashEntries}
                      canEdit={canEditStores}
                      embedded
                    />
                  </div>
                </section>
              )}
            </>
          ),
        }}
      />
    </div>
  );
}
