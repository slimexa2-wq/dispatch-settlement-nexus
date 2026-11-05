import Taro from "@tarojs/taro";
import { RegistrationForm } from "../../../components/registration-form";
import { AccessDenied, PageShell } from "../../../components/ui";
import { isOperatorRole } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";
import type { RegistrationInput } from "../../../api/types";

export default function ApplicationFormPage() {
  const user = useSession(false);
  const params = Taro.getCurrentInstance().router?.params ?? {};
  if (user && !user.permissions.includes("application:create") && !user.permissions.includes("referral:create")) return <AccessDenied />;

  let source: RegistrationInput["source"] = "SELF";
  if (user?.role === "SUPPLIER") source = "SUPPLIER";
  else if (user?.role === "EMPLOYEE") source = "REFERRAL";
  else if (user && isOperatorRole(user.role)) source = "OPERATOR";

  const title = source === "REFERRAL" ? "推荐报名" : source === "SUPPLIER" ? "立即报人" : "在线报名";
  return (
    <PageShell title={title} subtitle="项目、供应商与推荐关系由岗位和登录身份自动带出">
      <RegistrationForm
        source={source}
        initialJobId={params.jobId}
        publicMode={!user}
        referralToken={params.ref}
        submitText={source === "REFERRAL" ? "提交推荐" : "提交报名"}
        onSuccess={() => void Taro.navigateBack()}
      />
    </PageShell>
  );
}
