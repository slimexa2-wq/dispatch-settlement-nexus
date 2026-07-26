import type { ReactNode } from "react";
import { Alert, Button, Empty, Result, Skeleton, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { ApiError, getErrorMessage } from "../lib/api";

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />;
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 403) {
    return (
      <Result
        status="403"
        title="无权访问"
        subTitle="当前账号没有查看或操作此数据的权限。"
      />
    );
  }
  return (
    <Alert
      type="error"
      showIcon
      title="数据加载失败"
      description={
        <Space orientation="vertical">
          <span>{getErrorMessage(error)}</span>
          {onRetry ? (
            <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
              重新加载
            </Button>
          ) : null}
        </Space>
      }
    />
  );
}

export function EmptyBlock({ description = "暂无数据", extra }: { description?: string; extra?: ReactNode }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>{extra}</Empty>;
}
