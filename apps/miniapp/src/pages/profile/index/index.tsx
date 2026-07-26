import Taro from "@tarojs/taro";
import { Button } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import { clearSession } from "../../../auth/session";
import { FieldRow, PageShell, SectionCard } from "../../../components/ui";
import { runtimeConfig } from "../../../config/runtime";
import { roleLabels } from "../../../domain/roles";
import { useSession } from "../../../hooks/useSession";

export default function ProfilePage() {
  const user = useSession();
  const [binding, setBinding] = useState(false);
  if (!user) return <PageShell title="我的信息" />;
  const bindWechat = async () => {
    if (!runtimeConfig.wechatConfigured) {
      await Taro.showModal({
        title: "微信配置尚未完成",
        content: "需要先配置真实小程序 AppID、服务端 AppSecret 和合法域名，当前不会伪造绑定成功。",
        showCancel: false
      });
      return;
    }
    setBinding(true);
    try {
      const login = await Taro.login();
      const result = await api.bindWechat(login.code);
      await Taro.showToast({ title: result.bound ? "微信身份已绑定" : "绑定未完成", icon: result.bound ? "success" : "none" });
    } catch (error) {
      await Taro.showModal({
        title: "微信绑定失败",
        content: error instanceof Error ? error.message : "请稍后重试",
        showCancel: false
      });
    } finally {
      setBinding(false);
    }
  };
  const logout = async () => {
    const result = await Taro.showModal({ title: "退出登录", content: "确定退出当前账号吗？" });
    if (!result.confirm) return;
    clearSession();
    await Taro.reLaunch({ url: "/pages/login/index" });
  };
  return (
    <PageShell title="我的信息" subtitle="账号身份决定入口、操作权限与数据范围" showConfigGap>
      <SectionCard title="账号">
        <FieldRow label="姓名" value={user.displayName} />
        <FieldRow label="登录账号" value={user.username} />
        <FieldRow label="角色" value={roleLabels[user.role]} />
        <FieldRow label="分子公司范围" value={user.branchId ?? "按账号配置"} />
        <FieldRow label="项目范围" value={user.projectIds.length ? user.projectIds.length + " 个项目" : "按角色规则"} />
        <FieldRow label="人员绑定" value={user.personId ? "已绑定" : "未绑定"} />
        <FieldRow label="供应商绑定" value={user.supplierId ? "已绑定" : "未绑定"} />
      </SectionCard>
      <SectionCard title="权限">
        <FieldRow label="权限项数" value={String(user.permissions.length)} />
      </SectionCard>
      <Button className="button button--secondary" loading={binding} disabled={binding} onClick={() => void bindWechat()}>
        绑定当前微信身份
      </Button>
      <Button className="button button--danger" onClick={() => void logout()}>退出登录</Button>
    </PageShell>
  );
}
