/** Soma N dias úteis (seg–sex) a uma data civil YYYY-MM-DD. */
export function addBusinessDaysToDateKey(
  dateKey: string,
  businessDays: number,
): string {
  if (businessDays <= 0) return dateKey;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;

  const cur = new Date(Date.UTC(y, m - 1, d));
  let added = 0;
  while (added < businessDays) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return cur.toISOString().slice(0, 10);
}
