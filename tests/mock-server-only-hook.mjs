/** Permite importar módulos com `import "server-only"` e `next/cache` em scripts Node. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      format: "module",
      shortCircuit: true,
      url: "data:text/javascript,export{}",
    };
  }
  if (specifier === "next/cache" || specifier === "next/cache.js") {
    return {
      format: "module",
      shortCircuit: true,
      url:
        "data:text/javascript," +
        encodeURIComponent(`
export function unstable_cache(fn) { return fn; }
export function revalidatePath() {}
export function revalidateTag() {}
`),
    };
  }
  return nextResolve(specifier, context);
}
