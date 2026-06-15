import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceProvider } from "@/components/workspace-context";
import { PrivacyModeProvider } from "@/components/privacy-mode";
import { ScopeSync } from "@/components/scope-sync";
import { ScopeRouteGuard } from "@/components/scope-route-guard";
import { BottomNav } from "@/components/bottom-nav";
import { Topbar } from "@/components/topbar";
import { getCurrentUser, listUserWorkspaces } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Store } from "@/models/Store";
import { TEAM_INVITES_ENABLED } from "@/lib/feature-flags";
import { listPendingInvitationsForUser } from "@/lib/invitations";
import { PendingInvitesBanner } from "@/components/pending-invites-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await connectToDatabase();
  const storeQuery = activeStoreQueryForUser(user);

  const storeDocs = await Store.find(storeQuery)
    .select("name")
    .sort({ name: 1 })
    .lean();
  const stores = storeDocs.map((s) => ({ id: String(s._id), name: s.name }));
  const storeIds = stores.map((s) => s.id);
  const workspaces = await listUserWorkspaces(user.id);

  const pendingInviteCount =
    TEAM_INVITES_ENABLED
      ? (
          await listPendingInvitationsForUser({
            id: user.id,
            email: user.email,
            username: user.username,
          })
        ).length
      : 0;

  return (
    <WorkspaceProvider
      key={user.workspaceId}
      workspaceId={user.workspaceId}
      workspaceName={user.workspaceName}
    >
      <PrivacyModeProvider>
      <Suspense fallback={null}>
        <ScopeSync workspaceId={user.workspaceId} storeIds={storeIds} />
        <ScopeRouteGuard />
      </Suspense>
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} stores={stores} workspaces={workspaces} />
          <PendingInvitesBanner count={pendingInviteCount} />
          <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        </div>
        <BottomNav />
      </div>
      </PrivacyModeProvider>
    </WorkspaceProvider>
  );
}
