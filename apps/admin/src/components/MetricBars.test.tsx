import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricBars } from "./MetricBars";

describe("MetricBars", () => {
  it("统计项支持点击、Enter 和空格键下钻", () => {
    const onItemClick = vi.fn();
    const point = { name: "某项目", value: 12, projectId: "project-1" };
    render(<MetricBars data={[point]} onItemClick={onItemClick} />);

    const item = screen.getByRole("button", { name: "查看某项目对应人员，共12人" });
    fireEvent.click(item);
    fireEvent.keyDown(item, { key: "Enter" });
    fireEvent.keyDown(item, { key: " " });

    expect(onItemClick).toHaveBeenCalledTimes(3);
    expect(onItemClick).toHaveBeenLastCalledWith(point);
  });
});
