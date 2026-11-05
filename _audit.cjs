const fs = require("fs");
const data = JSON.parse(fs.readFileSync("output/祥能人员与招聘信息管理系统_演示版/web/demo-data.json", "utf-8"));
const ph = ["待系统上线后补充维护", "按项目政策维护", "按项目真实招聘要求维护", "按项目现场排班", "待维护"];
const cnt = {};
for (const k of ["projects", "jobDemands", "suppliers", "people", "applications"]) {
  cnt[k] = 0;
  for (const item of data[k]) {
    const s = JSON.stringify(item);
    if (ph.some((p) => s.includes(p))) cnt[k]++;
  }
}
console.log("含占位的记录数:", JSON.stringify(cnt, null, 2));

console.log("\n=== supplier 字段 ===");
console.log(Object.keys(data.suppliers[0] || {}));
console.log(JSON.stringify(data.suppliers[0], null, 1).slice(0, 900));

console.log("\n=== meta 字段 ===");
console.log(Object.keys(data.meta));
for (const k of Object.keys(data.meta)) {
  const v = data.meta[k];
  const t = Array.isArray(v) ? `数组(${v.length})` : typeof v === "object" ? "对象" : v;
  console.log("  ", k, ":", t);
}
