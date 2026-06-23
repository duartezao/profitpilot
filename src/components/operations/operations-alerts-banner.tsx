import Link from "next/link";
import type { CollectionReminder } from "@/lib/collection-schedule";
import { STORE_OPERATION_LABEL } from "@/lib/operations-pipeline";
import { cn } from "@/lib/utils";

export function OperationsAlertsBanner({
  exclusionNote,
  scopedStoreStatus,
  collectionReminders,
  className,
}: {
  exclusionNote?: string | null;
  scopedStoreStatus?: string | null;
  collectionReminders?: CollectionReminder[];
  className?: string;
}) {
  const reminders = collectionReminders ?? [];
  const hasScopedWarning =
    scopedStoreStatus &&
    scopedStoreStatus !== "running" &&
    scopedStoreStatus in STORE_OPERATION_LABEL;
  const hasContent =
    Boolean(exclusionNote) || reminders.length > 0 || hasScopedWarning;

  if (!hasContent) return null;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm",
        className,
      )}
    >
      {exclusionNote && (
        <p className="text-muted-foreground">
          {exclusionNote}{" "}
          <Link href="/operacao" className="font-medium text-accent hover:underline">
            Modo operação
          </Link>
        </p>
      )}
      {hasScopedWarning && (
        <p className="text-warning">
          Esta loja está «
          {STORE_OPERATION_LABEL[
            scopedStoreStatus as keyof typeof STORE_OPERATION_LABEL
          ]}
          » no pipeline — métricas visíveis mas fora do consolidado «a rodar».
        </p>
      )}
      {reminders.length > 0 && (
        <ul className="space-y-1">
          {reminders.slice(0, 5).map((r) => (
            <li
              key={r.collectionId}
              className={cn(
                r.urgency === "overdue"
                  ? "text-negative"
                  : r.urgency === "today"
                    ? "text-warning"
                    : "text-muted-foreground",
              )}
            >
              <span className="font-medium">{r.storeName}</span>: {r.message}{" "}
              <Link
                href={`/operacao/colecoes?taskStore=${r.storeId}`}
                className="text-accent hover:underline"
              >
                Coleções
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
