import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const srcBase = pathToFileURL(path.join(root, "src")).href + "/";

register("./resolve-alias-hook.mjs", import.meta.url, {
  data: { srcBase },
});
