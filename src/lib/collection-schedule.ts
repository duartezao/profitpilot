import { addDays, formatDateInput, parseDateInput, startOfDay } from "@/lib/period";

export const DEFAULT_COLLECTION_TEST_CYCLE_DAYS = 5;
export const DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE = 2;

export type CollectionReminderUrgency = "soon" | "today" | "overdue";

export type CollectionReminder = {
  collectionId: string;
  collectionName: string;
  storeId: string;
  storeName: string;
  message: string;
  urgency: CollectionReminderUrgency;
  dueDateKey: string | null;
};

export function computeTestEndDate(
  start: Date,
  cycleDays: number,
): Date {
  return startOfDay(addDays(start, Math.max(1, cycleDays)));
}

export function dateKeyFromDate(d: Date): string {
  return formatDateInput(startOfDay(d));
}

export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = parseDateInput(fromKey);
  const b = parseDateInput(toKey);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function formatCycleProgress(
  startedKey: string,
  endsKey: string,
  todayKey: string,
): string {
  const total = Math.max(1, daysBetweenKeys(startedKey, endsKey));
  const elapsed = Math.min(
    total,
    Math.max(0, daysBetweenKeys(startedKey, todayKey) + 1),
  );
  return `dia ${elapsed}/${total}`;
}

export function reminderUrgency(
  targetKey: string,
  todayKey: string,
  reminderDaysBefore: number,
): CollectionReminderUrgency | null {
  const diff = daysBetweenKeys(todayKey, targetKey);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= reminderDaysBefore) return "soon";
  return null;
}
