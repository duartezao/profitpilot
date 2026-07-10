/** Permite importar módulos com `import "server-only"` em scripts Node. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      format: "module",
      shortCircuit: true,
      url: "data:text/javascript,export{}",
    };
  }
  return nextResolve(specifier, context);
}
