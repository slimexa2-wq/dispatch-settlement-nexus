import assert from "node:assert/strict";
import test from "node:test";
import {
  autoMapMigrationHeaders,
  buildMigrationPreview,
  deriveMigrationBatchStatus,
  normalizeHeader,
  validateMigrationMapping
} from "../src/services/migration-center.ts";

test("批量迁移自动识别常见中文字段并报告缺失必填项", () => {
  const template = {
    fields: [
      { key: "name", label: "姓名", required: true, aliases: ["员工姓名", "人员姓名"] },
      { key: "phone", label: "手机号", required: true, aliases: ["联系电话", "电话"] },
      { key: "projectName", label: "项目", required: false, aliases: ["项目名称", "面试企业"] }
    ]
  };
  const result = autoMapMigrationHeaders(["人员姓名", "联系电话", "面试企业"], template);
  assert.deepEqual(result.mapping, {
    "人员姓名": "name",
    "联系电话": "phone",
    "面试企业": "projectName"
  });
  assert.deepEqual(result.missingRequired, []);
  assert.equal(normalizeHeader(" 联系 电话 "), "联系电话");
});

test("批量迁移预览保留原始行号并区分新增更新跳过和错误", () => {
  const preview = buildMigrationPreview({
    rows: [
      { __rowNum: 2, 姓名: "张三", 手机号: "13800000001" },
      { __rowNum: 3, 姓名: "李四", 手机号: "13800000002" },
      { __rowNum: 4, 姓名: "", 手机号: "13800000003" },
      { __rowNum: 5, 姓名: "王五", 手机号: "13800000004" }
    ],
    mapping: { 姓名: "name", 手机号: "phone" },
    fields: [
      { key: "name", label: "姓名", required: true },
      { key: "phone", label: "手机号", required: true }
    ],
    uniqueKeys: ["phone"],
    existingKeys: new Set(["13800000002"]),
    conflictPolicy: "UPDATE",
    ignoredSourceRows: new Set([5])
  });
  assert.deepEqual(preview.summary, { total: 4, creates: 1, updates: 1, skips: 1, errors: 1 });
  assert.equal(preview.rows[0]?.sourceRow, 2);
  assert.equal(preview.rows[1]?.action, "UPDATE");
  assert.equal(preview.rows[2]?.action, "ERROR");
  assert.match(preview.rows[2]?.errors[0] ?? "", /姓名/);
  assert.equal(preview.rows[3]?.action, "SKIP");
});

test("正式迁移模板包含内部员工所依赖的经营分公司岗位和职级主档", async () => {
  const { defaultMigrationTemplates } = await import("../src/services/migration-targets.ts");
  const targets = new Set(defaultMigrationTemplates.map((item) => item.targetEntity));
  assert.equal(targets.has("BRANCH"), true);
  assert.equal(targets.has("POSITION"), true);
  assert.equal(targets.has("JOB_GRADE"), true);
});

test("正式迁移模板覆盖招聘政策岗位和工资条等关键历史数据", async () => {
  const { defaultMigrationTemplates } = await import("../src/services/migration-targets.ts");
  const targets = new Set(defaultMigrationTemplates.map((item) => item.targetEntity));
  for (const target of ["POLICY", "JOB_DEMAND", "SALARY_SLIP"]) assert.equal(targets.has(target), true, `缺少${target}迁移模板`);
});

test("字段映射不能把两个Excel列映射到同一个系统字段", () => {
  const errors = validateMigrationMapping(
    { 姓名: "name", 员工姓名: "name", 手机号: "phone" },
    [
      { key: "name", label: "姓名", required: true },
      { key: "phone", label: "手机号", required: true }
    ]
  );
  assert.equal(errors.some((item) => item.includes("姓名")), true);
});

test("同一上传文件内唯一标识重复时全部标为错误，避免覆盖顺序决定结果", () => {
  const preview = buildMigrationPreview({
    rows: [
      { __rowNum: 2, 姓名: "张三", 手机号: "13800000001" },
      { __rowNum: 8, 姓名: "张三重复", 手机号: "13800000001" }
    ],
    mapping: { 姓名: "name", 手机号: "phone" },
    fields: [
      { key: "name", label: "姓名", required: true },
      { key: "phone", label: "手机号", required: true, format: "PHONE" }
    ],
    uniqueKeys: ["phone"],
    conflictPolicy: "UPDATE"
  });
  assert.equal(preview.summary.errors, 2);
  assert.deepEqual(preview.rows.map((row) => row.action), ["ERROR", "ERROR"]);
  assert.match(preview.rows[0]?.errors.join("；") ?? "", /第2、8行/);
});

test("迁移预览校验中国手机号身份证日期和整数格式", () => {
  const preview = buildMigrationPreview({
    rows: [{ 姓名: "测试", 手机号: "123", 身份证: "5101", 入职日期: "不是日期", 职级: "一级" }],
    mapping: { 姓名: "name", 手机号: "phone", 身份证: "idCard", 入职日期: "onboardDate", 职级: "level" },
    fields: [
      { key: "name", label: "姓名", required: true },
      { key: "phone", label: "手机号", required: true, format: "PHONE" },
      { key: "idCard", label: "身份证号", required: true, format: "ID_CARD" },
      { key: "onboardDate", label: "入职日期", required: true, format: "DATE" },
      { key: "level", label: "职级层级", required: true, format: "INTEGER" }
    ],
    uniqueKeys: ["idCard"],
    conflictPolicy: "UPDATE"
  });
  assert.equal(preview.rows[0]?.action, "ERROR");
  const errors = preview.rows[0]?.errors.join("；") ?? "";
  assert.match(errors, /手机号格式/);
  assert.match(errors, /身份证号格式/);
  assert.match(errors, /入职日期格式/);
  assert.match(errors, /职级层级必须是整数/);
});

test("断点续传时最终状态要同时考虑历史成功行，不能把部分成功误报为全部失败", () => {
  assert.equal(deriveMigrationBatchStatus({ committedRows: 8, failedRows: 2 }), "PARTIAL");
  assert.equal(deriveMigrationBatchStatus({ committedRows: 10, failedRows: 0 }), "COMMITTED");
  assert.equal(deriveMigrationBatchStatus({ committedRows: 0, failedRows: 3 }), "FAILED");
});

test("招聘政策岗位和工资条迁移目标同时支持写入和撤销", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/services/migration-targets.ts", import.meta.url), "utf8");
  for (const target of ["POLICY", "JOB_DEMAND", "SALARY_SLIP"]) {
    const matches = source.match(new RegExp(`case \\"${target}\\"`, "g")) ?? [];
    assert.ok(matches.length >= 3, `${target}应覆盖已有键、写入和撤销逻辑`);
  }
});
