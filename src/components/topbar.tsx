import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacyToggle } from "@/components/privacy-mode";
import { StoreSelector, type StoreOption } from "@/components/store-selector";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { PortfolioScopeSelector } from "@/components/portfolio-scope-selector";
import { PeriodSelector } from "@/components/period-selector";
import { logoutAction } from "@/app/(app)/actions";
import type { CurrentUser, UserWorkspace } from "@/lib/auth";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TopbarActions({
  user,
  showLogout = true,
  showAvatar = true,
}: {
  user: CurrentUser;
  showLogout?: boolean;
  showAvatar?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ThemeToggle />
      <PrivacyToggle />
      {showAvatar && (
        <div
          title={
            user.email
              ? `${user.name} · ${user.email}`
              : user.username
                ? `${user.name} · @${user.username}`
                : user.name
          }
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground md:flex"
        >
          {initials(user.name)}
        </div>
      )}
      {showLogout && (
        <form action={logoutAction} className="hidden md:block">
          <button
            type="submit"
            aria-label="Terminar sessão"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

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
      {/* Mobile — 2 linhas, altura automática */}
      <div className="flex flex-col gap-2 overflow-visible px-3 py-2 md:hidden">
        <div className="grid min-w-0 grid-cols-2 gap-2">
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
          <Suspense
            fallback={
              <div className="h-9 rounded-lg border border-border bg-muted" />
            }
          >
            <PortfolioScopeSelector
              workspaces={workspaces}
              userId={user.id}
              className="min-w-0"
            />
          </Suspense>
        </div>
        <Suspense
          fallback={
            <div className="h-9 rounded-lg border border-border bg-muted" />
          }
        >
          <StoreSelector stores={stores} className="min-w-0" />
        </Suspense>
        <div className="flex min-w-0 items-center gap-2">
          <Suspense
            fallback={
              <div className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted" />
            }
          >
            <PeriodSelector className="min-w-0 flex-1" fullWidth />
          </Suspense>
          <TopbarActions user={user} showLogout={false} showAvatar={false} />
        </div>
      </div>

      {/* Desktop — linha única */}
      <div className="hidden h-14 items-center justify-between gap-3 px-6 md:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Suspense
            fallback={
              <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
                Lojas
              </span>
            }
          >
            <StoreSelector stores={stores} />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-9 w-40 rounded-lg border border-border bg-muted" />
            }
          >
            <PortfolioScopeSelector
              workspaces={workspaces}
              userId={user.id}
              className="w-40 shrink-0"
            />
          </Suspense>
          <Suspense
            fallback={
              <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
                Período
              </span>
            }
          >
            <PeriodSelector />
          </Suspense>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Suspense
            fallback={
              <div className="h-9 w-44 rounded-lg border border-border bg-muted" />
            }
          >
            <WorkspaceSelector
              workspaces={workspaces}
              currentId={user.workspaceId}
              menuPlacement="bottom"
              className="w-44 shrink-0"
            />
          </Suspense>
          <TopbarActions user={user} />
        </div>
      </div>
    </header>
  );
}
