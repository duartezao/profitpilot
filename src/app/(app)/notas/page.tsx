import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { DailyNote } from "@/models/DailyNote";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import { formatDateInput } from "@/lib/period";
import { DailyNoteForm } from "./daily-note-form";
import { DailyReportPanel } from "@/components/dashboard/daily-report-panel";
import { CollapsibleSection } from "@/components/collapsible-section";

export const metadata: Metadata = { title: "Notas & Relatórios" };
export const dynamic = "force-dynamic";

const moodLabel: Record<string, string> = {
  good: "Bom",
  bad: "Mau",
  neutral: "Normal",
};

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { store: storeId } = await searchParams;
  await connectToDatabase();

  const stores = await Store.find(activeStoreQueryForUser(user))
    .select("name")
    .sort({ name: 1 })
    .lean();

  const storeMap = new Map(stores.map((s) => [String(s._id), s.name]));
  const scoped =
    storeId && canAccessStore(user.storeAccess, storeId)
      ? stores.find((s) => String(s._id) === storeId)
      : null;
  const scopeName = scoped?.name ?? null;

  const noteQuery: Record<string, unknown> = {
    workspaceId: user.workspaceId,
  };
  if (scoped) {
    noteQuery.$or = [{ storeId: scoped._id }, { storeId: null }];
  }

  const notes = await DailyNote.find(noteQuery)
    .sort({ date: -1 })
    .limit(30)
    .lean();

  const filteredNotes = scoped
    ? notes.filter(
        (n) =>
          !n.storeId || String(n.storeId) === String(scoped._id),
      )
    : notes;

  const today = formatDateInput(new Date());
  const canEdit = ["owner", "admin", "editor"].includes(user.role);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scopeName ? (
            <>
              Notas · <span data-sensitive>{scopeName}</span>
            </>
          ) : (
            "Notas & Relatórios"
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scopeName ? (
            "Diário de operação desta loja."
          ) : (
            <>
              Diário de operação — workspace{" "}
              <span data-sensitive>{user.workspaceName}</span>.
            </>
          )}
        </p>
      </div>

      {!scoped && stores.length > 0 && (
        <Suspense fallback={<div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />}>
          <DailyReportPanel />
        </Suspense>
      )}

      {scoped && (
        <Suspense fallback={<div className="h-14 animate-pulse rounded-lg border border-border bg-muted" />}>
          <DailyReportPanel storeId={String(scoped._id)} />
        </Suspense>
      )}

      <CollapsibleSection
        title="Nova nota"
        description="Regista scale, humor ou observações do dia."
      >
        <DailyNoteForm
          canEdit={canEdit}
          defaultDate={today}
          defaultStoreId={scoped ? String(scoped._id) : null}
          stores={stores.map((s) => ({ id: String(s._id), name: s.name }))}
          embedded
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Histórico"
        description={
          scopeName
            ? `Últimas notas de ${scopeName}.`
            : "Últimas notas deste workspace."
        }
        badge={
          filteredNotes.length > 0 ? (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {filteredNotes.length}
            </span>
          ) : undefined
        }
        flush
      >
        {filteredNotes.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Ainda não há notas. Regista o primeiro dia acima.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filteredNotes.map((n) => (
              <li key={String(n._id)} className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium tabular-nums">
                    {new Date(n.date).toLocaleDateString("pt-PT")}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground" data-sensitive>
                    {n.storeId
                      ? storeMap.get(String(n.storeId)) ?? "Loja"
                      : "Workspace"}
                  </span>
                  {n.didScale && (
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-accent">
                      Scale
                    </span>
                  )}
                  {n.mood && (
                    <span className="text-xs text-muted-foreground">
                      {moodLabel[n.mood] ?? n.mood}
                    </span>
                  )}
                </div>
                {n.text && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground" data-sensitive>
                    {n.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
