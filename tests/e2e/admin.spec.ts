import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { installMockApi } from "./mock-api";

const screenshotDir = "output/playwright/screenshots";

async function login(page: Page, username = "admin") {
  await page.goto("/login");
  await page.getByRole("tab", { name: "账号密码" }).click();
  await page.getByRole("textbox", { name: "账号", exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("E2E-Test-Password!");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await expect(page.getByRole("banner")).toBeVisible();
}

async function openResponsiveMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "打开菜单" });
  if (await trigger.isVisible()) await trigger.click();
}

async function navigateFromMenu(page: Page, label: string) {
  await openResponsiveMenu(page);
  await page.getByText(label, { exact: true }).click();
}

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("登录、首页真实指标与项目查询", async ({ page }, testInfo) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "数据首页" })).toBeVisible();
  await expect(page.getByText("招聘需求与缺口")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/dashboard-${testInfo.project.name}.png`, fullPage: true });

  await navigateFromMenu(page, "项目管理");
  await expect(page.getByRole("heading", { name: "项目管理" })).toBeVisible();
  await expect(page.getByText("E2E 核验项目")).toBeVisible();
  await page.getByPlaceholder("项目名称").fill("E2E");
  await page.getByPlaceholder("项目名称").press("Enter");
  await expect(page.getByText("宜宾分公司")).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/projects-${testInfo.project.name}.png`, fullPage: true });
});

test("人员报名归并并完成面试、入职、离职状态流转", async ({ page }) => {
  await login(page);
  await navigateFromMenu(page, "人员管理");
  await page.getByRole("button", { name: "人员报名" }).click();
  await page.getByLabel("姓名").fill("E2E 新报名人员");
  await page.getByLabel("身份证号").fill("51010119920202123X");
  await page.getByLabel("手机号").fill("13600000000");
  await page.getByLabel("项目").click();
  await page.getByText("E2E 核验项目", { exact: true }).last().click();
  await page.getByLabel("岗位").fill("质检员");
  await page.getByRole("button", { name: "确 定" }).click();
  await expect(page.getByText(/已创建 E2E 新报名人员|已保存 E2E 新报名人员/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E 新报名人员", exact: true })).toBeVisible();

  const row = page.getByRole("row", { name: /E2E 新报名人员/ });
  await row.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("面试状态").click();
  await page.getByText("面试通过", { exact: true }).last().click();
  await page.getByLabel("人员状态").click();
  await page.getByText("待入职", { exact: true }).last().click();
  await page.getByRole("button", { name: /保存$/ }).click();
  await expect(page.getByText("人员详情已保存")).toBeVisible();

  await page.getByLabel("人员状态").click();
  await page.getByText("在职", { exact: true }).last().click();
  await page.getByRole("button", { name: /保存$/ }).click();

  await page.getByLabel("人员状态").click();
  await page.getByText("离职", { exact: true }).last().click();
  await page.getByLabel("离职原因").fill("E2E 流程验收完成");
  await page.getByRole("button", { name: /保存$/ }).click();
  await page.locator(".person-detail-drawer .ant-drawer-close").click();
  await expect(row.locator(".ant-tag").filter({ hasText: "离职" })).toBeVisible();
});

test("花名册导出与招聘需求主模块可访问", async ({ page }) => {
  await login(page);
  await navigateFromMenu(page, "人员管理");
  await page.locator(".page-header").getByRole("button", { name: "download 导出", exact: true }).click();
  await expect(page.getByText("确认导出人员数据", { exact: true }).last()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "确认下载", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^人员花名册-.*\.xlsx$/);

  await openResponsiveMenu(page);
  await page.getByText("招聘管理", { exact: true }).click();
  await page.getByText("招聘需求", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "招聘需求" })).toBeVisible();
  await expect(page.getByText("E2E 包装操作员")).toBeVisible();
});

test("资源专员只看到授权模块", async ({ page }, testInfo) => {
  await login(page, "resource");
  await openResponsiveMenu(page);
  await expect(page.getByText("供应商管理", { exact: true })).toBeVisible();
  await expect(page.getByText("人员管理", { exact: true })).toHaveCount(0);
  await expect(page.getByText("工资条管理", { exact: true })).toHaveCount(0);
  await expect(page.getByText("数据导入", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${screenshotDir}/resource-scope-${testInfo.project.name}.png`, fullPage: true });
});
