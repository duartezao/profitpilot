import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnv(){for(const n of[".env.local",".env"]){try{const raw=readFileSync(resolve(process.cwd(),n),"utf8");for(const line of raw.split("\n")){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}return;}catch{}}}
loadEnv();
const m=(await import("mongoose")).default;
await m.connect(process.env.MONGODB_URI!);
const { ProductCost }=await import("@/models/ProductCost");
const { Order }=await import("@/models/Order");
const gid="gid://shopify/ProductVariant/57848425283919";
const pc=await ProductCost.find({ variantId: gid }).lean();
console.log("ProductCost rows:", pc.length, JSON.stringify(pc,null,2));
const ord=await Order.findOne({"lineItems.variantId":gid}).select("lineItems").lean();
const line=ord?.lineItems?.find((l)=>l.variantId===gid);
console.log("Order line unitCost:", line?.unitCost);
await m.disconnect();
