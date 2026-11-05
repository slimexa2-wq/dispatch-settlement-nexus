import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.argv[2] ?? "http://127.0.0.1:4173";
const screenshotDir = resolve("output/playwright/package");
await mkdir(screenshotDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (entry) => {
  if (entry.type() === "error") consoleErrors.push(entry.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "验证码" }).fill("8888");
  await page.getByRole("button", { name: "进入系统" }).click();
  await page.getByRole("heading", { name: "数据首页" }).waitFor();

  for (const label of ["本期面试", "截止在职", "本期入职", "本期离职", "本期面试通过"]) {
    await page.getByText(label, { exact: true }).first().waitFor();
  }
  assert(await page.getByText("统计分析", { exact: true }).count() === 0, "统计分析菜单仍然存在");
  await page.screenshot({ path: resolve(screenshotDir, "01-dashboard.png"), fullPage: true });

  await page.goto(`${baseURL}/recruitment/demands`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "招聘需求" }).waitFor();
  const editButtons = page.getByRole("button", { name: "编辑" });
  assert(await editButtons.count() > 0, "招聘需求列表没有合并后的编辑入口");
  await editButtons.first().click();
  await page.getByText("招聘需求详情与编辑", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存修改" }).waitFor();
  await page.getByLabel("招聘岗位").last().waitFor();
  await page.screenshot({ path: resolve(screenshotDir, "02-job-edit-drawer.png"), fullPage: true });

  await page.goto(`${baseURL}/miniapp-demo`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "可交互小程序演示" }).waitFor();
  const controls = page.locator(".xn-control-panel");
  const tabs = page.locator(".xn-phone-tabs");

  await controls.getByText("内部-领导", { exact: true }).click();
  for (const label of ["工作台", "人员", "项目", "我的"]) await tabs.getByText(label, { exact: true }).waitFor();
  await page.locator(".xn-phone-body").getByText("核心数据", { exact: true }).waitFor();
  await page.locator(".xn-phone-body").getByText("项目招聘进度", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshotDir, "03-miniapp-leader.png"), fullPage: true });

  await controls.getByText("内部-运营", { exact: true }).click();
  for (const label of ["工作台", "人员", "项目", "我的"]) await tabs.getByText(label, { exact: true }).waitFor();
  await page.locator(".xn-phone-body").getByText("快捷报名", { exact: true }).first().waitFor();
  await tabs.getByText("人员", { exact: true }).click();
  await page.getByPlaceholder("按姓名、手机号、身份证、项目搜索").waitFor();
  await page.getByPlaceholder("按姓名、手机号、身份证、项目搜索").fill("张");
  await page.locator(".xn-phone-body").getByRole("button", { name: "面试通过", exact: true }).click();
  await page.locator(".xn-filter-tabs button.active").getByText("面试通过", { exact: true }).waitFor();
  await tabs.getByText("工作台", { exact: true }).click();
  await page.getByRole("button", { name: "待处理任务" }).click();
  await page.getByRole("button", { name: "发布招聘需求" }).click();
  await page.getByText("发布负责项目的招聘需求", { exact: true }).waitFor();
  await page.getByPlaceholder("工作内容").waitFor();
  await page.getByPlaceholder("岗位要求").waitFor();
  await page.locator(".xn-phone-tabs").getByText("工作台", { exact: true }).click();
  await page.getByRole("button", { name: "报名二维码" }).click();
  await page.getByRole("button", { name: "生成报名二维码" }).click();
  await page.getByText("二维码预览", { exact: true }).waitFor();
  await page.locator(".xn-phone-tabs").getByText("工作台", { exact: true }).click();
  await page.locator(".xn-phone-body").getByRole("button", { name: "快捷报名" }).click();
  await page.getByRole("button", { name: "上传身份证图片并识别姓名/身份证号" }).click();
  await page.getByPlaceholder("推荐人（祥能自招必填）").waitFor();
  await page.screenshot({ path: resolve(screenshotDir, "04-miniapp-operator.png"), fullPage: true });

  await controls.getByText("供应商", { exact: true }).click();
  for (const label of ["岗位需求", "我的人员", "结算", "我的"]) await tabs.getByText(label, { exact: true }).waitFor();
  await page.locator(".xn-phone-body").getByRole("button", { name: "查看详情" }).first().click();
  await page.getByText("岗位要求", { exact: true }).first().waitFor();
  await page.getByText("项目负责人", { exact: true }).waitFor();
  await tabs.getByText("我的人员", { exact: true }).click();
  await page.getByPlaceholder("搜索姓名或手机号").waitFor();
  assert(await page.locator(".xn-phone-body").getByRole("button", { name: "通过", exact: true }).count() === 0, "供应商端出现了面试通过操作");
  assert(await page.locator(".xn-phone-body").getByRole("button", { name: "未通过", exact: true }).count() === 0, "供应商端出现了面试未通过操作");
  await tabs.getByText("结算", { exact: true }).click();
  await page.getByText("结算明细", { exact: true }).waitFor();
  await page.getByRole("button", { name: "提交申诉" }).first().click();
  await page.getByText("结算申诉", { exact: true }).first().waitFor();

  await controls.getByText("个人-员工", { exact: true }).click();
  for (const label of ["首页", "内部推荐", "工资条", "我的"]) await tabs.getByText(label, { exact: true }).waitFor();
  await tabs.getByText("我的", { exact: true }).click();
  await page.getByRole("button", { name: "电子合同" }).click();
  const contractEmployees = await page.locator(".xn-field-line").evaluateAll((rows) => rows
    .filter((row) => row.querySelector("span")?.textContent?.trim() === "员工")
    .map((row) => row.querySelector("strong")?.textContent?.trim())
    .filter(Boolean));
  assert(new Set(contractEmployees).size <= 1, "员工端显示了其他员工的合同");
  await tabs.getByText("工资条", { exact: true }).click();
  await page.getByText("本人可见", { exact: false }).waitFor();

  await controls.getByText("个人-求职", { exact: true }).click();
  for (const label of ["找工作", "报名进度", "我的"]) await tabs.getByText(label, { exact: true }).waitFor();
  await page.getByText("热门岗位", { exact: true }).waitFor();
  await page.locator(".xn-phone-body").getByRole("button", { name: "立即报名" }).first().click();
  const candidateName = await page.locator(".xn-phone-body input").first().inputValue();
  await page.locator(".xn-phone-body").getByRole("button", { name: "提交报名" }).click();
  await page.getByText(/报名时间：/).first().waitFor();

  await controls.getByText("内部-运营", { exact: true }).click();
  await tabs.getByText("人员", { exact: true }).click();
  await page.getByPlaceholder("按姓名、手机号、身份证、项目搜索").fill(candidateName);
  await page.locator(".xn-phone-body").getByText(candidateName, { exact: true }).click();
  await page.locator(".xn-phone-body").getByRole("button", { name: "面试通过", exact: true }).click();
  await page.locator(".xn-phone-body").getByText("面试通过", { exact: true }).first().waitFor();

  await controls.getByText("个人-求职", { exact: true }).click();
  await tabs.getByText("报名进度", { exact: true }).click();
  await page.locator(".xn-phone-body").getByText("面试通过", { exact: true }).first().waitFor();
  await tabs.getByText("我的", { exact: true }).click();
  await page.locator(".xn-section-title").getByText("个人资料", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存个人资料" }).waitFor();
  await page.screenshot({ path: resolve(screenshotDir, "05-miniapp-candidate.png"), fullPage: true });

  await page.waitForTimeout(300);
  assert(consoleErrors.length === 0, `浏览器控制台错误：${consoleErrors.join(" | ")}`);
  assert(pageErrors.length === 0, `页面运行错误：${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({
    result: "passed",
    baseURL,
    checks: ["login", "dashboard-period-labels", "job-edit-drawer", "three-port-tabs", "operator-tools", "registration-qr", "supplier-permission", "supplier-settlement", "employee-contract-scope", "employee-salary", "candidate-application", "cross-role-status-sync", "candidate-profile", "console"],
    screenshots: screenshotDir
  }, null, 2));
} finally {
  await browser.close();
}
