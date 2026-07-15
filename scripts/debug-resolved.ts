import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnv(){for(const n of[".env"]){try{const raw=readFileSync(resolve(process.cwd(),n),"utf8");for(const line of raw.split("\n")){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}return;}catch{}}}
loadEnv();
const m=(await import("mongoose")).default;
await m.connect(process.env.MONGODB_URI!);
const storeOid=new m.Types.ObjectId("6a2f3c90f28d6fea7e49ddf3");
const costCollection=(await import("@/models/ProductCost")).ProductCost.collection.name;
const rows=await m.connection.db!.collection(costCollection).aggregate([
  { $match: { storeId: storeOid, variantId: "gid://shopify/ProductVariant/57848425283919" } },
  { $project: {
    unitCost: 1,
    manualCost: 1,
    manualIsSet: { $ne: ["$manualCost", null] },
    costGt: { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] },
    resolved: { $or: [{ $ne: ["$manualCost", null] }, { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] }] },
  } },
]).toArray();
console.log(rows);
await m.disconnect();
