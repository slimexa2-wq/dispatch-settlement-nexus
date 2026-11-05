import type { PropsWithChildren, ReactNode } from "react";
import { Card } from "antd";

type Props = PropsWithChildren<{
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
}>;

export function ContentCard({ title, extra, className, children }: Props) {
  return (
    <Card className={`content-card${className ? ` ${className}` : ""}`} title={title} extra={extra}>
      {children}
    </Card>
  );
}
