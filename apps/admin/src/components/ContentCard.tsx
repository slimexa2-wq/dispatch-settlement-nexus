import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { Card } from "antd";

type Props = PropsWithChildren<{
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
  style?: CSSProperties;
}>;

export function ContentCard({ title, extra, className, style, children }: Props) {
  return (
    <Card className={`content-card${className ? ` ${className}` : ""}`} style={style} title={title} extra={extra}>
      {children}
    </Card>
  );
}
