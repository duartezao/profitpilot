"use client";

import type { ReactNode } from "react";
import { Sensitive } from "@/components/privacy-mode";
import { SettingsCollapsibleSection } from "@/components/settings-collapsible-section";

const statusLabel: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};

const statusTone: Record<string, string> = {
  active: "text-positive border-positive/30 bg-positive/10",
  paused: "text-muted-foreground border-border bg-muted",
  archived: "text-muted-foreground border-border bg-muted",
};

export function StoreSettingsBlock({
  storeName,
  displayUrl,
  status,
  defaultOpen = false,
  children,
}: {
  storeName: string;
  displayUrl: string;
  status: "active" | "paused" | "archived";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <SettingsCollapsibleSection
      title={<Sensitive>{storeName}</Sensitive>}
      description={<Sensitive>{displayUrl}</Sensitive>}
      defaultOpen={defaultOpen}
      badge={
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusTone[status] ?? statusTone.active}`}
        >
          {statusLabel[status] ?? status}
        </span>
      }
    >
      {children}
    </SettingsCollapsibleSection>
  );
}
