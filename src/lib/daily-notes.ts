import "server-only";
import mongoose from "mongoose";
import { DailyNote } from "@/models/DailyNote";
import { dateFieldMatch, type ResolvedPeriod } from "@/lib/period";

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
