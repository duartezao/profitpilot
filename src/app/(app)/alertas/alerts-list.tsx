import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceAlert, AlertSeverity } from "@/lib/alerts";

const severityMeta: Record<
  AlertSeverity,
  { icon: typeof AlertTriangle; border: string; label: string }
> = {
  critical: {
    icon: AlertTriangle,
    border: "border-negative/40 bg-negative/5",
    label: "Crítico",
  },
  warning: {
    icon: AlertCircle,
    border: "border-warning/40 bg-warning/5",
    label: "Aviso",
  },
  info: {
    icon: Info,
    border: "border-border bg-surface",
    label: "Info",
  },
};

export function AlertsList({ alerts }: { alerts: WorkspaceAlert[] }) {
  if (!alerts.length) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Sem alertas activos. Tudo em ordem.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {alerts.map((alert) => {
        const meta = severityMeta[alert.severity];
        const Icon = meta.icon;
        const inner = (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${meta.border}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{alert.title}</p>
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </span>
                {alert.storeName && (
                  <span className="text-xs text-muted-foreground" data-sensitive>
                    · {alert.storeName}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {alert.description}
              </p>
            </div>
            {alert.href && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        );

        return (
          <li key={alert.id}>
            {alert.href ? (
              <Link href={alert.href} className="block hover:opacity-90">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
