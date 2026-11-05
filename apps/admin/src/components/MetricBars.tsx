import { Empty, Progress, Space, Typography } from "antd";
import type { StatPoint } from "../types/domain";

type MetricBarsProps = {
  data?: StatPoint[];
  color?: string;
  onItemClick?: (item: StatPoint) => void;
};

export function MetricBars({ data, color = "#1268f3", onItemClick }: MetricBarsProps) {
  if (!data?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无统计数据" />;
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="metric-bars">
      {data.map((item) => (
        <div
          className={`metric-row${onItemClick ? " clickable" : ""}`}
          key={`${item.branchId ?? item.projectId ?? item.supplierId ?? item.status ?? "point"}-${item.name}`}
          role={onItemClick ? "button" : undefined}
          tabIndex={onItemClick ? 0 : undefined}
          aria-label={onItemClick ? `查看${item.name}对应人员，共${item.value}人` : undefined}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
          onKeyDown={onItemClick ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onItemClick(item);
            }
          } : undefined}
        >
          <Space className="metric-label">
            <Typography.Text ellipsis={{ tooltip: item.name }}>{item.name}</Typography.Text>
            <Typography.Text strong>{item.value}</Typography.Text>
          </Space>
          <Progress
            percent={Math.round((item.value / max) * 100)}
            showInfo={false}
            strokeColor={color}
            trailColor="#e8f0f1"
          />
        </div>
      ))}
    </div>
  );
}
