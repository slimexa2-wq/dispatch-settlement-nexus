import { AccessDenied, PageShell } from "../../../components/ui";
import { RegistrationForm } from "../../../components/registration-form";
import { useSession } from "../../../hooks/useSession";

export default function OperatorRegistrationPage() {
  const user = useSession();
  if (!user) return <PageShell title="人员报名" />;
  if (!user.permissions.includes("people:write")) return <AccessDenied />;
  return (
    <PageShell title="人员报名" subtitle="现场一次录入，面试、入职、离职沿用同一档案">
      <RegistrationForm source="OPERATOR" submitText="提交报名" />
    </PageShell>
  );
}
