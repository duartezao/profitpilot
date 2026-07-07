import "server-only";
import {
  addDaysToDateKey,
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  PERIOD_PRESETS,
  resolvePeriod,
  type PeriodInput,
  type ResolvedPeriod,
} from "@/lib/period";

const FALLBACK_PRESET = "30d" as const;

/** Período do topbar resolvido com «hoje» no fuso da loja. */
export function resolvePeriodForStore(
  input: PeriodInput,
  timeZone: string,
): ResolvedPeriod {
  if (input.dates?.trim()) {
    return resolvePeriod(input);
  }
  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) {
    return resolvePeriod({ from, to });
  }

  const tz = normalizeStoreTimezone(timeZone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const preset =
    PERIOD_PRESETS.find((p) => p.id === input.period?.trim())?.id ?? FALLBACK_PRESET;

  switch (preset) {
    case "today":
      return resolvePeriod({ dates: todayKey });
    case "yesterday":
      return resolvePeriod({ dates: addDaysToDateKey(todayKey, -1, tz) });
    case "7d":
      return resolvePeriod({
        from: addDaysToDateKey(todayKey, -6, tz),
        to: todayKey,
      });
    case "30d":
      return resolvePeriod({
        from: addDaysToDateKey(todayKey, -29, tz),
        to: todayKey,
      });
    case "90d":
      return resolvePeriod({
        from: addDaysToDateKey(todayKey, -89, tz),
        to: todayKey,
      });
    case "365d":
      return resolvePeriod({
        from: addDaysToDateKey(todayKey, -364, tz),
        to: todayKey,
      });
    case "month": {
      const [y, m] = todayKey.split("-").map(Number);
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      return resolvePeriod({ from: monthStart, to: todayKey });
    }
    case "ytd": {
      const y = todayKey.slice(0, 4);
      return resolvePeriod({ from: `${y}-01-01`, to: todayKey });
    }
    default:
      return resolvePeriod({ period: preset });
  }
}
