"use client";

import { cn } from "@/lib/utils";

const links = [
  { id: "conta", label: "Conta" },
  { id: "convites", label: "Convites" },
  { id: "convidar", label: "Convidar" },
  { id: "meus-workspaces", label: "Workspaces" },
  { id: "workspace-activo", label: "Workspace activo" },
  { id: "equipa", label: "Equipa" },
  { id: "lojas", label: "Lojas" },
  { id: "capital-negocio", label: "Capital" },
  { id: "lojas-workspaces", label: "Mover lojas" },
] as const;

export function SettingsNav({
  showInvites,
  showSendInvites,
  showMoveStores,
  showTeam = false,
}: {
  showInvites?: boolean;
  showSendInvites?: boolean;
  showMoveStores?: boolean;
  showTeam?: boolean;
}) {
  const visible = links.filter((l) => {
    if (l.id === "convites" && !showInvites) return false;
    if (l.id === "convidar" && !showSendInvites) return false;
    if (l.id === "equipa" && !showTeam) return false;
    if (l.id === "lojas-workspaces" && !showMoveStores) return false;
    return true;
  });

  return (
    <nav
      aria-label="Secções de definições"
      className="sticky top-14 z-30 -mx-3 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:rounded-lg sm:border sm:p-3"
    >
      {visible.map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          className={cn(
            "shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
