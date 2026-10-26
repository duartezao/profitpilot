/** Teste rápido do RPC corrigido (após cooldown). */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function rpc(path, payload) {
  const res = await fetch(
    `https://adstransparency.google.com/anji/_/rpc/${path}?authuser=`,
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "*/*",
        Origin: "https://adstransparency.google.com",
        Referer: "https://adstransparency.google.com/?region=anywhere",
      },
      body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
      signal: AbortSignal.timeout(25000),
    },
  );
  const text = await res.text();
  if (text.startsWith("<")) {
    console.log(path, "BLOCKED/HTML", res.status);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.log(path, "bad json", text.slice(0, 200));
    return null;
  }
}

const sug = await rpc("SearchService/SearchSuggestions", {
  1: "CAVALEIRUS LLC",
  2: 10,
  3: 10,
  5: { 1: 1 },
});
const ids = (sug?.["1"] || [])
  .map((r) => r?.["1"]?.["2"])
  .filter(Boolean)
  .slice(0, 2);
console.log("ids", ids);

const cre = await rpc("SearchService/SearchCreatives", {
  2: 20,
  3: { 13: { 1: ids } },
  7: { 1: 1 },
});
console.log("creatives", (cre?.["1"] || []).length);

const hosts = new Set();
for (const c of cre?.["1"] || []) {
  if (c["14"]) hosts.add(c["14"]);
  const preview = c["3"]?.["1"]?.["4"];
  if (!preview?.includes?.("content.js")) continue;
  const r = await fetch(preview, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(12000),
  });
  let js = await r.text();
  js = js
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
  for (const m of js.matchAll(
    /\b([a-z0-9][a-z0-9-]{1,40}\.(?:at|de|ch|hu|nl|com|fr|it))\b/gi,
  )) {
    hosts.add(m[1].toLowerCase());
  }
}
console.log("hosts", [...hosts]);
