import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { TestCollection } from "@/models/TestCollection";
import {
  COLLECTION_PIPELINE_LABEL,
  normalizeCollectionPipelineStatus,
  type CollectionPipelineStatus,
} from "@/lib/operations-pipeline";
import {
  computeTestEndDate,
  dateKeyFromDate,
  daysBetweenKeys,
  DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE,
  DEFAULT_COLLECTION_TEST_CYCLE_DAYS,
  formatCycleProgress,
  reminderUrgency,
  type CollectionReminder,
} from "@/lib/collection-schedule";
import { formatDateInput, parseDateInput, startOfDay } from "@/lib/period";

export type CollectionScheduleFields = {
  scheduledStartDate: Date | null;
  testStartedAt: Date | null;
  testEndsAt: Date | null;
  cycleDays: number;
};

export function cycleDaysForStore(
  store: { collectionTestCycleDays?: number | null },
  collection?: { cycleDays?: number | null },
): number {
  const n = collection?.cycleDays ?? store.collectionTestCycleDays;
  return typeof n === "number" && n > 0
    ? n
    : DEFAULT_COLLECTION_TEST_CYCLE_DAYS;
}

export function scheduleFieldsForStatusChange(
  nextStatus: CollectionPipelineStatus,
  prevStatus: CollectionPipelineStatus | null,
  existing: Partial<CollectionScheduleFields>,
  cycleDays: number,
  scheduledStartDate?: Date | null,
): Partial<CollectionScheduleFields> {
  const patch: Partial<CollectionScheduleFields> = {
    cycleDays,
  };

  if (scheduledStartDate !== undefined) {
    patch.scheduledStartDate = scheduledStartDate;
  }

  if (nextStatus === "testing" && prevStatus !== "testing") {
    const start =
      existing.scheduledStartDate &&
      existing.scheduledStartDate > new Date()
        ? startOfDay(existing.scheduledStartDate)
        : startOfDay(new Date());
    patch.testStartedAt = start;
    patch.testEndsAt = computeTestEndDate(start, cycleDays);
  }

  if (
    prevStatus === "testing" &&
    (nextStatus === "winner" ||
      nextStatus === "failed" ||
      nextStatus === "skipped" ||
      nextStatus === "queue")
  ) {
    // Mantém histórico de datas; não limpa.
  }

  return patch;
}

export type CollectionReportBlock = {
  lines: string[];
  testingNow: string | null;
  nextCollection: string | null;
  testedList: string;
  skippedList: string;
  reminder: string | null;
};

function fmtDayKey(key: string): string {
  const d = parseDateInput(key);
  return d
    ? d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : key;
}

export async function buildCollectionReportBlock(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<CollectionReportBlock> {
  await connectToDatabase();
  const store = await Store.findOne({
    _id: storeId,
    workspaceId,
    deletedAt: null,
  })
    .select("name collectionTestCycleDays collectionReminderDaysBefore")
    .lean();

  if (!store) {
    return {
      lines: [],
      testingNow: null,
      nextCollection: null,
      testedList: "",
      skippedList: "",
      reminder: null,
    };
  }

  const rows = await TestCollection.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    storeId: new mongoose.Types.ObjectId(storeId),
    deletedAt: null,
  })
    .sort({ status: 1, scheduledStartDate: 1, updatedAt: -1 })
    .lean();

  const cycleDefault = cycleDaysForStore(store);
  const reminderBefore =
    store.collectionReminderDaysBefore ??
    DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE;

  const lines: string[] = [];
  let testingNow: string | null = null;
  let nextCollection: string | null = null;
  const tested: string[] = [];
  const skipped: string[] = [];
  let reminder: string | null = null;

  const testing = rows.filter(
    (r) => normalizeCollectionPipelineStatus(r.status) === "testing",
  );
  const queue = rows.filter(
    (r) => normalizeCollectionPipelineStatus(r.status) === "queue",
  );

  for (const c of testing) {
    const started = c.testStartedAt
      ? dateKeyFromDate(new Date(c.testStartedAt))
      : null;
    const ends = c.testEndsAt ? dateKeyFromDate(new Date(c.testEndsAt)) : null;
    if (started && ends && dateKey >= started && dateKey <= ends) {
      const progress = formatCycleProgress(started, ends, dateKey);
      const endsLabel = fmtDayKey(ends);
      testingNow = `${c.name} (${progress} — termina ${endsLabel})`;
      lines.push(`COLEÇÃO A TESTAR: ${testingNow}`);

      const urg = ends ? reminderUrgency(ends, dateKey, reminderBefore) : null;
      if (urg) {
        const daysLeft = daysBetweenKeys(dateKey, ends);
        if (urg === "overdue") {
          reminder = `Lembrete: ciclo de «${c.name}» terminou — avaliar e pôr próxima coleção.`;
        } else if (urg === "today") {
          reminder = `Lembrete: hoje termina o ciclo de «${c.name}» — preparar troca.`;
        } else {
          reminder = `Lembrete: faltam ${daysLeft} dia(s) para trocar «${c.name}» (ciclo ${cycleDaysForStore(store, c)} dias).`;
        }
      }
    }
  }

  const nextQueued =
    queue.find((c) => c.scheduledStartDate) ??
    queue[0];
  if (nextQueued) {
    const sched = nextQueued.scheduledStartDate
      ? dateKeyFromDate(new Date(nextQueued.scheduledStartDate))
      : null;
    nextCollection = sched
      ? `${nextQueued.name} (agendada ${fmtDayKey(sched)})`
      : nextQueued.name;
    lines.push(`PRÓXIMA COLEÇÃO: ${nextCollection}`);

    if (sched) {
      const urg = reminderUrgency(sched, dateKey, reminderBefore);
      if (urg === "today" || urg === "soon") {
        const startMsg =
          urg === "today"
            ? `hoje é dia de iniciar «${nextQueued.name}»`
            : `em breve inicia «${nextQueued.name}» (${fmtDayKey(sched)})`;
        reminder = reminder
          ? `${reminder} · ${startMsg}`
          : `Lembrete: ${startMsg}.`;
      }
    }
  }

  for (const c of rows) {
    const st = normalizeCollectionPipelineStatus(c.status);
    if (st === "winner" || st === "failed") {
      const updated = c.updatedAt ? dateKeyFromDate(new Date(c.updatedAt)) : null;
      if (!updated || updated <= dateKey) {
        tested.push(`${c.name} (${COLLECTION_PIPELINE_LABEL[st].toLowerCase()})`);
      }
    }
    if (st === "skipped") {
      skipped.push(c.name);
    }
  }

  const testedList = tested.join(", ");
  const skippedList = skipped.join(", ");

  if (testedList) lines.push(`COLEÇÕES JÁ TESTADAS: ${testedList}`);
  if (skippedList) lines.push(`NÃO VAI TESTAR: ${skippedList}`);
  if (reminder) lines.push(`LEMBRETE: ${reminder.replace(/^Lembrete:\s*/, "")}`);

  return {
    lines,
    testingNow,
    nextCollection,
    testedList,
    skippedList,
    reminder,
  };
}

export async function listCollectionRemindersForWorkspace(
  workspaceId: string,
  storeIds: mongoose.Types.ObjectId[],
): Promise<CollectionReminder[]> {
  if (!storeIds.length) return [];
  await connectToDatabase();

  const stores = await Store.find({ _id: { $in: storeIds } })
    .select("name collectionTestCycleDays collectionReminderDaysBefore")
    .lean();
  const storeById = new Map(stores.map((s) => [String(s._id), s]));

  const rows = await TestCollection.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    storeId: { $in: storeIds },
    deletedAt: null,
    status: { $in: ["testing", "queue"] },
  }).lean();

  const todayKey = formatDateInput(startOfDay(new Date()));
  const out: CollectionReminder[] = [];

  for (const c of rows) {
    const store = storeById.get(String(c.storeId));
    if (!store) continue;
    const reminderBefore =
      store.collectionReminderDaysBefore ??
      DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE;
    const st = normalizeCollectionPipelineStatus(c.status);

    if (st === "testing" && c.testEndsAt) {
      const endsKey = dateKeyFromDate(new Date(c.testEndsAt));
      const urg = reminderUrgency(endsKey, todayKey, reminderBefore);
      if (!urg) continue;
      const daysLeft = daysBetweenKeys(todayKey, endsKey);
      const message =
        urg === "overdue"
          ? `Ciclo de «${c.name}» terminou — pôr próxima coleção`
          : urg === "today"
            ? `Hoje termina o teste de «${c.name}»`
            : `Trocar «${c.name}» em ${daysLeft} dia(s)`;
      out.push({
        collectionId: String(c._id),
        collectionName: c.name,
        storeId: String(c.storeId),
        storeName: store.name,
        message,
        urgency: urg,
        dueDateKey: endsKey,
      });
    }

    if (st === "queue" && c.scheduledStartDate) {
      const startKey = dateKeyFromDate(new Date(c.scheduledStartDate));
      const urg = reminderUrgency(startKey, todayKey, reminderBefore);
      if (!urg) continue;
      out.push({
        collectionId: String(c._id),
        collectionName: c.name,
        storeId: String(c.storeId),
        storeName: store.name,
        message:
          urg === "today"
            ? `Iniciar teste de «${c.name}» hoje`
            : `Iniciar «${c.name}» em ${daysBetweenKeys(todayKey, startKey)} dia(s)`,
        urgency: urg,
        dueDateKey: startKey,
      });
    }
  }

  const order: Record<CollectionReminder["urgency"], number> = {
    overdue: 0,
    today: 1,
    soon: 2,
  };
  return out.sort((a, b) => order[a.urgency] - order[b.urgency]);
}
