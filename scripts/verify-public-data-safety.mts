import { resolve } from "node:path";
import { assertPublicDataSafe } from "./lib/public-data-safety.mjs";

const root = resolve(import.meta.dirname, "..");
await assertPublicDataSafe(root);
console.log("public_data_safe=true");

