import { Suspense } from "react";
import { StoreSelector, type StoreOption } from "@/components/store-selector";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { PortfolioScopeSelector } from "@/components/portfolio-scope-selector";
import { TopbarPeriodSelector } from "@/components/topbar-period";
import { TopbarMoreMenu } from "@/components/topbar-more-menu";
import type { CurrentUser, UserWorkspace } from "@/lib/auth";

export function Topbar({
  user,
  stores,
  workspaces,
}: {
  user: CurrentUser;
  stores: StoreOption[];
  workspaces: UserWorkspace[];
}) {
  return (
    <header className="sticky top-0 z-50 shrink-0 overflow-visible border-b border-border bg-background">
      {/* Telemóvel + tablet */}
      <div className="flex flex-col gap-2 overflow-visible px-3 py-2 sm:px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Suspense
            fallback={
              <div className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted" />
            }
          >
            <WorkspaceSelector
              workspaces={workspaces}
              currentId={user.workspaceId}
              menuPlacement="bottom"
              className="min-w-0 flex-1 md:hidden"
            />
          </Suspense>
          <TopbarMoreMenu user={user} className="md:hidden" />
        </div>

        <Suspense
          fallback={
            <div className="h-9 rounded-lg border border-border bg-muted md:hidden" />
          }
        >
          <StoreSelector stores={stores} className="min-w-0 md:hidden" />
        </Suspense>

        <div className="hidden min-w-0 grid-cols-[1fr_1fr_auto] gap-2 md:grid">
          <Suspense
            fallback={
              <div className="h-9 rounded-lg border border-border bg-muted" />
            }
          >
            <StoreSelector stores={stores} className="min-w-0" />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-9 rounded-lg border border-border bg-muted" />
            }
          >
            <WorkspaceSelector
              workspaces={workspaces}
              currentId={user.workspaceId}
              menuPlacement="bottom"
              className="min-w-0"
            />
          </Suspense>
          <TopbarMoreMenu user={user} />
        </div>

        <TopbarPeriodSelector className="min-w-0 w-full" fullWidth />
      </div>

      {/* Desktop — loja + período à vista; resto no menu «…» */}
      <div className="hidden items-center justify-between gap-3 px-4 py-2 lg:flex lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Suspense
            fallback={
              <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
                Lojas
              </span>
            }
          >
            <StoreSelector stores={stores} className="max-w-[min(100%,14rem)]" />
          </Suspense>
          <TopbarPeriodSelector />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Suspense
            fallback={
              <div className="h-9 w-36 rounded-lg border border-border bg-muted" />
            }
          >
            <WorkspaceSelector
              workspaces={workspaces}
              currentId={user.workspaceId}
              menuPlacement="bottom"
              className="w-36 shrink-0 xl:w-40"
            />
          </Suspense>
          <Suspense fallback={null}>
            <PortfolioScopeSelector
              workspaces={workspaces}
              userId={user.id}
              className="w-28 shrink-0 xl:w-32"
            />
          </Suspense>
          <TopbarMoreMenu user={user} />
        </div>
      </div>
    </header>
  );
}
