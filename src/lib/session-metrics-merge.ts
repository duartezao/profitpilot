export type DaySessionCounts = {
  sessions: number;
  cart: number;
  checkout: number;
  completed: number;
};

function isAllZero(d: DaySessionCounts): boolean {
  return (
    d.sessions === 0 &&
    d.cart === 0 &&
    d.checkout === 0 &&
    d.completed === 0
  );
}

/** Preferir contagens mais completas (evita zeros ISO a apagar legado com dados). */
export function preferSessionDayCounts(
  a: DaySessionCounts | undefined,
  b: DaySessionCounts,
): DaySessionCounts {
  if (!a) return b;
  const aZero = isAllZero(a);
  const bZero = isAllZero(b);
  if (aZero && !bZero) return b;
  if (!aZero && bZero) return a;
  if (b.sessions > a.sessions) return b;
  if (a.sessions > b.sessions) return a;
  return {
    sessions: a.sessions,
    cart: Math.max(a.cart, b.cart),
    checkout: Math.max(a.checkout, b.checkout),
    completed: Math.max(a.completed, b.completed),
  };
}
