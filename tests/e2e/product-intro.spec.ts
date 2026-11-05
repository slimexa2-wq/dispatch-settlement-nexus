import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const screenshotDir = "output/playwright/product";

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

test("产品介绍页内容、预览切换与响应式布局", async ({ page }, testInfo) => {
  await page.goto("/product");

  await expect(page.getByRole("heading", { name: "一套数据，贯通招聘与人员全流程" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "为什么要做：现有工作痛点" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "系统整体架构：一套数据，三个端口，多方协同" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "核心业务闭环：一人一档，全流程记录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "祥能 AI 业务助手，不是固定回复的聊天框" })).toBeVisible();
  await expect(page.getByText("Qwen3.5 4B · Ollama 本地运行")).toBeVisible();

  const supplierTab = page.getByRole("tab", { name: "供应商端" });
  await supplierTab.click();
  await expect(supplierTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByAltText("供应商端界面")).toBeVisible();
  await expect(page.getByText("看岗位、看人员、看结算。")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: `${screenshotDir}/产品介绍-${testInfo.project.name}.png`,
    fullPage: true
  });
});
