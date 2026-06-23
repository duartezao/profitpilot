"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { TestCollectionView } from "@/lib/operations";
import {
  COLLECTION_PIPELINE_LABEL,
  COLLECTION_PIPELINE_STATUSES,
} from "@/lib/operations-pipeline";
import {
  createTestCollectionAction,
  deleteTestCollectionAction,
  updateStoreCollectionCycleAction,
  updateTestCollectionAction,
} from "@/app/(app)/operacao/actions";
import {
  collectionPipelineTone,
  PipelineStatusPill,
} from "@/components/operations/pipeline-status-pill";
import { cn } from "@/lib/utils";

type StoreOption = {
  id: string;
  name: string;
  cycleDays: number;
  reminderDaysBefore: number;
};

export function ColecoesClient({
  rows,
  stores,
  canEdit,
  storeId,
}: {
  rows: TestCollectionView[];
  stores: StoreOption[];
  canEdit: boolean;
  storeId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduledStartDate, setScheduledStartDate] = useState("");
  const [newStoreId, setNewStoreId] = useState(storeId ?? stores[0]?.id ?? "");
  const [newStatus, setNewStatus] = useState("queue");

  const activeStore = useMemo(
    () => stores.find((s) => s.id === (storeId ?? newStoreId)) ?? stores[0],
    [stores, storeId, newStoreId],
  );

  const [cycleDays, setCycleDays] = useState(activeStore?.cycleDays ?? 5);
  const [reminderDays, setReminderDays] = useState(
    activeStore?.reminderDaysBefore ?? 2,
  );

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setName("");
        setNotes("");
        setScheduledStartDate("");
        router.refresh();
      }
    });
  }

  function saveCycleSettings() {
    if (!activeStore) return;
    run(() =>
      updateStoreCollectionCycleAction({
        storeId: activeStore.id,
        cycleDays,
        reminderDaysBefore: reminderDays,
      }),
    );
  }

  const testingRows = rows.filter((r) => r.status === "testing");
  const upcomingReminders = rows.filter((r) => r.reminderText);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coleções</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ciclo de teste (ex. 5 dias) com lembretes 1–2 dias antes. O relatório
          diário da loja inclui o que está a testar, o que falta e próximos
          passos.
        </p>
        </div>
        <Link
          href="/operacao"
          className="text-sm text-accent hover:underline"
        >
          Voltar a Hoje
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {upcomingReminders.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium text-warning">Lembretes activos</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {upcomingReminders.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-foreground">{r.name}</span> (
                {r.storeName}): {r.reminderText}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && activeStore && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">
            Ciclo de teste — {activeStore.name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Por defeito cada coleção testa-se {cycleDays} dias; aviso{" "}
            {reminderDays} dia(s) antes do fim ou do início agendado.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Dias por ciclo
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={cycleDays}
                onChange={(e) => setCycleDays(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Avisar (dias antes)
              </span>
              <input
                type="number"
                min={0}
                max={14}
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={pending}
                onClick={saveCycleSettings}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                Guardar ciclo
              </button>
            </div>
          </div>
        </div>
      )}

      {canEdit && stores.length > 0 && (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              createTestCollectionAction({
                storeId: newStoreId,
                name,
                status: newStatus as (typeof COLLECTION_PIPELINE_STATUSES)[number],
                notes,
                scheduledStartDate: scheduledStartDate || undefined,
              }),
            );
          }}
        >
          <h2 className="text-sm font-semibold">Nova coleção</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Loja</span>
              <select
                value={newStoreId}
                onChange={(e) => setNewStoreId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                required
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Nome</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Ex. Perfumes verão"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Início planeado
              </span>
              <input
                type="date"
                value={scheduledStartDate}
                onChange={(e) => setScheduledStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Estado</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {COLLECTION_PIPELINE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {COLLECTION_PIPELINE_LABEL[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Notas</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Opcional"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      )}

      {testingRows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          A testar agora:{" "}
          {testingRows
            .map((r) =>
              r.cycleProgress
                ? `${r.name} (${r.cycleProgress})`
                : r.name,
            )
            .join(" · ")}
        </p>
      )}

      <div className="space-y-3 lg:hidden">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
            Sem coleções. Adiciona a primeira acima.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.storeName}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteTestCollectionAction(row.id))}
                    className="shrink-0 text-sm text-negative hover:underline disabled:opacity-60"
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Estado
                  </p>
                  <div className="mt-1">
                    {canEdit ? (
                      <select
                        value={row.status}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            updateTestCollectionAction({
                              id: row.id,
                              status: e.target.value,
                            }),
                          )
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        {COLLECTION_PIPELINE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {COLLECTION_PIPELINE_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <PipelineStatusPill
                        label={COLLECTION_PIPELINE_LABEL[row.status]}
                        tone={collectionPipelineTone(row.status)}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Ciclo
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {row.cycleProgress ??
                      (row.cycleDays ? `${row.cycleDays}d` : "—")}
                    {row.testEndsLabel && (
                      <span className="block text-xs">até {row.testEndsLabel}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Agendamento
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {row.scheduledStartLabel ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Lembrete
                  </p>
                  <p className="mt-1">
                    {row.reminderText ? (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          row.reminderText.includes("terminou")
                            ? "text-negative"
                            : "text-warning",
                        )}
                      >
                        {row.reminderText}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Coleção</th>
              <th className="px-3 py-2 font-medium">Loja</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Ciclo</th>
              <th className="px-3 py-2 font-medium">Agendamento</th>
              <th className="px-3 py-2 font-medium">Lembrete</th>
              {canEdit && <th className="px-3 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 7 : 6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Sem coleções. Adiciona a primeira acima.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.storeName}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <select
                        value={row.status}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            updateTestCollectionAction({
                              id: row.id,
                              status: e.target.value,
                            }),
                          )
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      >
                        {COLLECTION_PIPELINE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {COLLECTION_PIPELINE_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <PipelineStatusPill
                        label={COLLECTION_PIPELINE_LABEL[row.status]}
                        tone={collectionPipelineTone(row.status)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.cycleProgress ?? (row.cycleDays ? `${row.cycleDays}d` : "—")}
                    {row.testEndsLabel && (
                      <span className="block text-xs">até {row.testEndsLabel}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.scheduledStartLabel ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.reminderText ? (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          row.reminderText.includes("terminou")
                            ? "text-negative"
                            : "text-warning",
                        )}
                      >
                        {row.reminderText}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => deleteTestCollectionAction(row.id))
                        }
                        className="text-sm text-negative hover:underline disabled:opacity-60"
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
