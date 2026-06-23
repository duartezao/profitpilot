"use client";

import type { WorkspaceMemberOption } from "@/lib/operation-tasks-types";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TaskAssigneeBadge({
  name,
  isSelf,
  compact = false,
  className,
}: {
  name: string;
  isSelf?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 text-xs text-foreground",
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
        className,
      )}
      title={isSelf ? `${name} (tu)` : name}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground",
          compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]",
        )}
      >
        {initials(name)}
      </span>
      {!compact && (
        <span className="max-w-[8rem] truncate">
          {isSelf ? "Tu" : name}
        </span>
      )}
    </span>
  );
}

export function TaskAssigneePicker({
  members,
  value,
  onChange,
  disabled,
  className,
  id,
}: {
  members: WorkspaceMemberOption[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm"
      >
        <option value="">Sem responsável</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.isSelf ? `${m.name} (tu)` : m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
