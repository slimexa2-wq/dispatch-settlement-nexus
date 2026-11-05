import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../api/services";
import { saveSession } from "../../auth/session";
import { FormField, TextField } from "../../components/form";
import { PageShell, SectionCard } from "../../components/ui";
import { runtimeConfig } from "../../config/runtime";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const finishLogin = async (task: () => ReturnType<typeof api.login>) => {
    setSubmitting(true);
    try {
      const result = await task();
      saveSession(result.token, result.user);
      await Taro.reLaunch({ url: "/pages/index/index" });
    } catch (error) {
      await Taro.showModal({
        title: "登录失败",
        content: error instanceof Error ? error.message : "请检查账号或网络配置",
        showCancel: false
      });
    } finally {
      setSubmitting(false);
    }
  };

  const passwordLogin = async () => {
    if (!username.trim() || !password) {
      await Taro.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    await finishLogin(() => api.login(username.trim(), password));
  };

  const wechatLogin = async () => {
    if (!runtimeConfig.wechatConfigured) {
      await Taro.showModal({
        title: "微信配置尚未完成",
        content: "当前没有真实 AppID/AppSecret 和合法域名，不能执行微信登录。请先使用开发账号。",
        showCancel: false
      });
      return;
    }
    setSubmitting(true);
    try {
      const login = await Taro.login();
      const result = await api.wechatLogin(login.code);
      saveSession(result.token, result.user);
      await Taro.reLaunch({ url: "/pages/index/index" });
    } catch (error) {
      await Taro.showModal({
        title: "微信登录失败",
        content: error instanceof Error ? error.message : "微信登录暂不可用",
        showCancel: false
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="祥能人事招聘" subtitle="人员、招聘、供应商、推荐与工资条统一入口" showConfigGap>
      <SectionCard title="开发账号登录">
        <FormField label="账号" required>
          <TextField value={username} placeholder="请输入测试账号" onChange={setUsername} />
        </FormField>
        <FormField label="密码" required>
          <TextField value={password} placeholder="请输入密码" onChange={setPassword} />
        </FormField>
        <Button className="button" loading={submitting} disabled={submitting} onClick={() => void passwordLogin()}>
          登录
        </Button>
      </SectionCard>
      <Button className="button button--secondary" loading={submitting} disabled={submitting} onClick={() => void wechatLogin()}>
        微信身份登录
      </Button>
      <Button className="button button--secondary" onClick={() => void Taro.navigateTo({ url: "/pages/jobs/index/index" })}>
        暂不登录，浏览招聘岗位
      </Button>
      <View className="spacer" />
      <Text className="muted">系统不内置虚构账号。测试账号由后台种子生成并在项目交付说明中统一维护。</Text>
    </PageShell>
  );
}
