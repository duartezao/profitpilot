"use client";

import { cn } from "@/lib/utils";

const links = [
  { id: "conta", label: "Conta" },
  { id: "convites", label: "Convites" },
  { id: "meus-workspaces", label: "Workspaces" },
  { id: "workspace-activo", label: "Workspace activo" },
  { id: "equipa", label: "Equipa" },
  { id: "lojas", label: "Lojas" },
  { id: "capital-negocio", label: "Capital" },
  { id: "lojas-workspaces", label: "Mover lojas" },
] as const;

export function SettingsNav({
  showInvites,
  showMoveStores,
}: {
  showInvites?: boolean;
  showMoveStores?: boolean;
}) {
  const visible = links.filter((l) => {
    if (l.id === "convites" && !showInvites) return false;
    if (l.id === "lojas-workspaces" && !showMoveStores) return false;
    return true;
  });

  return (
    <nav
      aria-label="Secções de definições"
      className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3"
    >
      {visible.map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          className={cn(
            "rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
