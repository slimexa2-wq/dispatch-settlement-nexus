import { useState } from "react";
import { Drawer, FloatButton } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { UserRole } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { AiAssistantPanel } from "./AiAssistantPanel";

const supportedRoles = new Set<string>([
  UserRole.HEADQUARTERS_MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROJECT_OPERATOR,
  UserRole.SUPPLIER,
  UserRole.EMPLOYEE,
  UserRole.SYSTEM_ADMIN
]);

export function AdminAiDrawer() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  if (!user || !supportedRoles.has(user.role)) return null;
  return <>
    <FloatButton className="admin-ai-float" icon={<RobotOutlined />} tooltip="祥能AI业务助手" onClick={() => setOpen(true)} />
    <Drawer
      title="祥能AI业务助手"
      placement="right"
      size={560}
      open={open}
      onClose={() => setOpen(false)}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <AiAssistantPanel compact />
    </Drawer>
  </>;
}
