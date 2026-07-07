import "server-only";
import mongoose from "mongoose";
import { DailyNote, type DailyNoteReportFields, type DailyNoteApiSnapshot } from "@/models/DailyNote";
import {
  dateFieldMatch,
  endOfDay,
  parseDateInput,
  startOfDay,
  type ResolvedPeriod,
} from "@/lib/period";

export type StoreDailyNoteView = {
  date: string;
  dateLabel: string;
  text: string;
  didScale: boolean;
  mood: "good" | "bad" | "neutral" | null;
  /** Nota específica da loja ou nota global do workspace. */
  scope: "store" | "workspace";
};

type PeriodSlice = Pick<ResolvedPeriod, "start" | "end" | "specificDates">;

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNoteDate(d: Date): string {
  return d.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type ResolvedDailyNote = {
  text: string;
  didScale: boolean;
  mood: "good" | "bad" | "neutral" | null;
  reportFields: DailyNoteReportFields;
  apiSnapshot?: DailyNoteApiSnapshot | null;
  scope: "store" | "workspace";
};

function normalizeReportFields(
  raw: DailyNoteReportFields | null | undefined,
): DailyNoteReportFields {
  return {
    productsTested: (raw?.productsTested ?? "").trim(),
    collectionsTested: (raw?.collectionsTested ?? "").trim(),
    collectionsTestedList: (raw?.collectionsTestedList ?? "").trim(),
    nextCollection: (raw?.nextCollection ?? "").trim(),
    bestSellerCollection: (raw?.bestSellerCollection ?? "").trim(),
    dayNumber: (raw?.dayNumber ?? "").trim(),
    difficulties: (raw?.difficulties ?? "").trim(),
    obs: (raw?.obs ?? "").trim(),
  };
}

/** Nota de um dia para uma loja (prioriza nota da loja sobre nota global do workspace). */
export async function fetchStoreDailyNoteForDay(
  workspaceId: mongoose.Types.ObjectId | string,
  storeId: mongoose.Types.ObjectId | string,
  dateKey: string,
): Promise<ResolvedDailyNote | null> {
  const day = parseDateInput(dateKey);
  if (!day) return null;

  const dateFilter = dateFieldMatch("date", {
    start: startOfDay(day),
    end: endOfDay(day),
    specificDates: [dateKey],
  });

  const notes = await DailyNote.find({
    workspaceId,
    $and: [dateFilter, { $or: [{ storeId }, { storeId: null }] }],
  }).lean();

  const match =
    notes.find((n) => n.storeId && String(n.storeId) === String(storeId)) ??
    notes.find((n) => !n.storeId) ??
    null;
  if (!match) return null;

  const isStore =
    match.storeId != null && String(match.storeId) === String(storeId);

  const snap = match.apiSnapshot;
  const apiSnapshot: DailyNoteApiSnapshot | null = snap
    ? {
        cpc: snap.cpc ?? null,
        ctr: snap.ctr ?? null,
        cpm: snap.cpm ?? null,
        currency: snap.currency ?? "USD",
        bestCampaign: snap.bestCampaign ?? "",
        campaignSuggestion: snap.campaignSuggestion ?? "",
        syncedAt: snap.syncedAt ?? undefined,
      }
    : null;

  return {
    text: (match.text ?? "").trim(),
    didScale: Boolean(match.didScale),
    mood: match.mood ?? null,
    reportFields: normalizeReportFields(match.reportFields),
    apiSnapshot,
    scope: isStore ? "store" : "workspace",
  };
}

/** Notas do período para uma loja (prioriza nota da loja sobre nota global). */
export async function fetchStoreDailyNotesForPeriod(
  workspaceId: mongoose.Types.ObjectId,
  storeId: mongoose.Types.ObjectId,
  slice: PeriodSlice,
): Promise<StoreDailyNoteView[]> {
  const dateFilter = dateFieldMatch("date", slice);
  const raw = await DailyNote.find({
    workspaceId,
    $and: [dateFilter, { $or: [{ storeId }, { storeId: null }] }],
  })
    .sort({ date: -1 })
    .lean();

  const byDay = new Map<string, StoreDailyNoteView>();

  for (const n of raw) {
    const noteDate = new Date(n.date);
    const key = dayKey(noteDate);
    const isStore =
      n.storeId != null && String(n.storeId) === String(storeId);
    const view: StoreDailyNoteView = {
      date: key,
      dateLabel: formatNoteDate(noteDate),
      text: (n.text ?? "").trim(),
      didScale: Boolean(n.didScale),
      mood: n.mood ?? null,
      scope: isStore ? "store" : "workspace",
    };

    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, view);
      continue;
    }
    if (isStore && existing.scope === "workspace") {
      byDay.set(key, view);
    }
  }

  const allowedDays = slice.specificDates
    ? new Set(slice.specificDates)
    : null;

  return Array.from(byDay.values())
    .filter((n) => {
      if (allowedDays && !allowedDays.has(n.date)) return false;
      return Boolean(n.text || n.didScale || n.mood);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Notas do workspace no período (todas as lojas + globais) — para gráfico consolidado. */
export async function fetchWorkspaceDailyNotesForPeriod(
  workspaceId: mongoose.Types.ObjectId,
  slice: PeriodSlice,
): Promise<StoreDailyNoteView[]> {
  const dateFilter = dateFieldMatch("date", slice);
  const raw = await DailyNote.find({
    workspaceId,
    ...dateFilter,
  })
    .sort({ date: -1 })
    .lean();

  const byDay = new Map<string, StoreDailyNoteView>();

  for (const n of raw) {
    const noteDate = new Date(n.date);
    const key = dayKey(noteDate);
    const isStore = n.storeId != null;
    const view: StoreDailyNoteView = {
      date: key,
      dateLabel: formatNoteDate(noteDate),
      text: (n.text ?? "").trim(),
      didScale: Boolean(n.didScale),
      mood: n.mood ?? null,
      scope: isStore ? "store" : "workspace",
    };
    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, view);
      continue;
    }
    if (isStore && existing.scope === "workspace") {
      byDay.set(key, view);
    }
  }

  const allowedDays = slice.specificDates
    ? new Set(slice.specificDates)
    : null;

  return Array.from(byDay.values())
    .filter((n) => {
      if (allowedDays && !allowedDays.has(n.date)) return false;
      return Boolean(n.text || n.didScale || n.mood);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
