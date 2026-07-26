import type { ReactNode } from "react";
import { Space, Typography } from "antd";

type Props = {
  title: string;
  description?: string;
  extra?: ReactNode;
};

export function PageHeader({ title, description, extra }: Props) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={2}>{title}</Typography.Title>
        {description ? <Typography.Paragraph>{description}</Typography.Paragraph> : null}
      </div>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}
