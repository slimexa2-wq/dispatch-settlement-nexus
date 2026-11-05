import { Card, Typography } from "antd";
import { AiAssistantPanel } from "../components/AiAssistantPanel";

export function AiAssistantPage() {
  return <div className="page-container">
    <Typography.Title level={3}>祥能AI业务助手</Typography.Title>
    <Typography.Paragraph type="secondary">
      本地 Qwen3.5 4B 负责意图理解，所有查询和写操作均由正式业务服务按当前登录权限执行。
    </Typography.Paragraph>
    <Card className="admin-ai-page-card"><AiAssistantPanel /></Card>
  </div>;
}
