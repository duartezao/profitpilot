import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnv(){for(const n of[".env"]){try{const raw=readFileSync(resolve(process.cwd(),n),"utf8");for(const line of raw.split("\n")){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}return;}catch{}}}
loadEnv();
const m=(await import("mongoose")).default;
await m.connect(process.env.MONGODB_URI!);
const r=await m.connection.db!.collection("productcosts").findOne({
  variantId:"gid://shopify/ProductVariant/57848425283919",
});
console.log(JSON.stringify(r,null,2));
console.log("keys", Object.keys(r ?? {}));
console.log("manualCost" in (r??{}), r?.manualCost);
await m.disconnect();
