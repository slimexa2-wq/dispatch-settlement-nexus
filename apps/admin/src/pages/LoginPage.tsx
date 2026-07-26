import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Tabs, Typography } from "antd";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../lib/api";
import { homePathForPermissions } from "../routes/home";

type LoginValues = { username: string; password: string };
type CodeLoginValues = { code: string };

export function LoginPage() {
  const { user, login, loginWithCode } = useAuth();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (user) return <Navigate to={homePathForPermissions(user.permissions)} replace />;

  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const submit = async (values: LoginValues) => {
    setSubmitting(true);
    setError(undefined);
    try {
      const session = await login(values.username, values.password);
      const home = homePathForPermissions(session.permissions);
      navigate(from === "/dashboard" && home !== "/dashboard" ? home : from, { replace: true });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (values: CodeLoginValues) => {
    setSubmitting(true);
    setError(undefined);
    try {
      const session = await loginWithCode(values.code);
      const home = homePathForPermissions(session.permissions);
      navigate(from === "/dashboard" && home !== "/dashboard" ? home : from, { replace: true });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-badge">祥能人力 · 统一业务平台</div>
        <Typography.Title>让项目、招聘与人员信息保持同一条主线</Typography.Title>
        <Typography.Paragraph>
          管理真实项目数据，贯通报名、面试、入职、在职与离职，所有统计均可回到业务明细。
        </Typography.Paragraph>
        <div className="login-feature-grid">
          <div><strong>统一档案</strong><span>一次报名，持续更新</span></div>
          <div><strong>数据下钻</strong><span>指标直接回到名单</span></div>
          <div><strong>属地权限</strong><span>按公司和项目隔离</span></div>
        </div>
        <Link className="login-product-link" to="/product">查看完整产品介绍 <span>→</span></Link>
      </section>
      <Card className="login-card" variant="borderless">
        <div className="login-logo">祥</div>
        <Typography.Title level={2}>登录管理端</Typography.Title>
        <Typography.Paragraph type="secondary">演示环境可使用验证码快速进入</Typography.Paragraph>
        {error ? <Alert type="error" showIcon title={error} /> : null}
        <Tabs
          defaultActiveKey="code"
          items={[
            {
              key: "code",
              label: "验证码登录",
              children: (
                <Form<CodeLoginValues> layout="vertical" size="large" onFinish={submitCode} requiredMark={false}>
                  <Alert type="info" showIcon title="演示验证码：8888" className="demo-code-alert" />
                  <Form.Item name="code" label="验证码" rules={[{ required: true, message: "请输入验证码" }]}>
                    <Input prefix={<SafetyCertificateOutlined />} inputMode="numeric" maxLength={6} placeholder="请输入 8888" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    进入系统
                  </Button>
                </Form>
              )
            },
            {
              key: "password",
              label: "账号密码",
              children: (
                <Form<LoginValues> layout="vertical" size="large" onFinish={submit} requiredMark={false}>
                  <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
                    <Input prefix={<UserOutlined />} autoComplete="username" placeholder="请输入账号" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                    <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="请输入密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    登录
                  </Button>
                </Form>
              )
            }
          ]}
        />
        <Typography.Text type="secondary" className="login-help">
          演示身份读写统一演示业务库；AI 写操作仍须预览确认，并可一键重置。
        </Typography.Text>
      </Card>
    </main>
  );
}
