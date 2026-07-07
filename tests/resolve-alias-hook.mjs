/** @type {string} */
let srcBase;

/** @param {{ srcBase: string }} data */
export async function initialize(data) {
  srcBase = data.srcBase;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let url = new URL(specifier.slice(2), srcBase).href;
    if (!/\.[a-z]+$/i.test(url)) {
      url += ".ts";
    }
    return nextResolve(url, context);
  }
  return nextResolve(specifier, context);
}
