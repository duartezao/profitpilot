/** @type {string} */
let srcBase;

/** @param {{ srcBase: string }} data */
export async function initialize(data) {
  srcBase = data.srcBase;
}

const nextCacheMock =
  "data:text/javascript," +
  encodeURIComponent(`
export function unstable_cache(fn) { return fn; }
export function revalidatePath() {}
export function revalidateTag() {}
`);

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
      url: nextCacheMock,
    };
  }
  if (specifier === "next/headers" || specifier === "next/headers.js") {
    return {
      format: "module",
      shortCircuit: true,
      url: "data:text/javascript,export async function cookies(){return{get:()=>undefined,delete:()=>{}}}",
    };
  }
  if (specifier.startsWith("@/")) {
    let url = new URL(specifier.slice(2), srcBase).href;
    if (!/\.[a-z]+$/i.test(url)) {
      url += ".ts";
    }
    return nextResolve(url, context);
  }
  return nextResolve(specifier, context);
}
