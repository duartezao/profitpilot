/** `?fresh=1` — bypass cache servidor / memória e recalcula a partir da BD. */
export function parseFreshParam(
  params: URLSearchParams | { get(name: string): string | null },
): boolean {
  const v = params.get("fresh");
  return v === "1" || v === "true";
}
