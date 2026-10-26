const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function rpc(path, payload) {
  const body = "f.req=" + encodeURIComponent(JSON.stringify(payload));
  const res = await fetch(
    `https://adstransparency.google.com/anji/_/rpc/${path}?authuser=`,
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        Origin: "https://adstransparency.google.com",
        Referer: "https://adstransparency.google.com/?region=anywhere",
      },
      body,
      signal: AbortSignal.timeout(25000),
    },
  );
  return JSON.parse(await res.text());
}

function extractHosts(text) {
  const hosts = new Set();
  const re =
    /https?:\/\/(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/gi;
  for (const m of text.matchAll(re)) hosts.add(m[1].toLowerCase());
  return [...hosts];
}

function unescapeJs(js) {
  return js
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\\//g, "/");
}

const creatives =
  (
    await rpc("SearchService/SearchCreatives", {
      2: 15,
      3: { 13: { 1: ["AR06836292787843891201"] } },
      7: { 1: 1 },
    })
  )["1"] || [];

console.log("creatives", creatives.length);

const hosts = new Set();
for (const c of creatives) {
  if (c["14"]) hosts.add(String(c["14"]).toLowerCase());
  const preview = c["3"]?.["1"]?.["4"];
  if (!preview) continue;
  try {
    const r = await fetch(preview, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const js = unescapeJs(await r.text());
    for (const h of extractHosts(js)) hosts.add(h);
    // displayUrl / destination patterns in HTML
    for (const m of js.matchAll(
      /(?:destinationUrl|landingPage|finalUrl|display_url|displayUrl)["':=\s]+([^"'<\s]+)/gi,
    )) {
      for (const h of extractHosts(m[1] ?? "")) hosts.add(h);
    }
  } catch (e) {
    console.log("preview fail", e.message);
  }
}

console.log("hosts", [...hosts]);

const adv = await rpc("LookupService/GetAdvertiserById", {
  1: "AR06836292787843891201",
  2: 1,
});
console.log("GetAdvertiserById", JSON.stringify(adv).slice(0, 1200));

// domain search still has field 14
const byDom = await rpc("SearchService/SearchCreatives", {
  2: 5,
  3: { 12: { 1: "brigitte-wien.at", 2: true } },
  7: { 1: 1 },
});
console.log(
  "domain search sample keys",
  Object.keys((byDom["1"] || [])[0] || {}),
  "14=",
  (byDom["1"] || [])[0]?.["14"],
);
