import { useMemo, useState, type ReactNode } from "react";
import {
  ApartmentOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { Alert, Button, Card, Space, Tag, Typography } from "antd";

type DemoRole = "personal" | "operator" | "project" | "supplier";

const portalOrigin = (import.meta.env.VITE_PORTAL_ORIGIN as string | undefined) ?? "http://127.0.0.1:4320";

const roleOptions: Array<{
  id: DemoRole;
  label: string;
  subtitle: string;
  route: string;
  icon: ReactNode;
  highlights: string[];
}> = [
  {
    id: "personal",
    label: "个人/员工端",
    subtitle: "岗位、报名、推荐、工资条与个人服务",
    route: "/personal/home",
    icon: <UserOutlined />,
    highlights: ["岗位筛选与详情", "在线报名/收藏", "推荐与个人服务"]
  },
  {
    id: "operator",
    label: "内部管理端",
    subtitle: "工作台、人员、项目与现场运营",
    route: "/internal/dashboard",
    icon: <TeamOutlined />,
    highlights: ["实时业务看板", "人员生命周期", "岗位发布与二维码"]
  },
  {
    id: "project",
    label: "项目负责人端",
    subtitle: "授权项目的需求、人员和招聘进度",
    route: "/internal/projects",
    icon: <ApartmentOutlined />,
    highlights: ["项目范围隔离", "岗位需求维护", "招聘进度联动"]
  },
  {
    id: "supplier",
    label: "供应商端",
    subtitle: "岗位、输送人员、结算与申诉",
    route: "/supplier/jobs",
    icon: <ShopOutlined />,
    highlights: ["岗位详情可点击", "人员与状态查询", "结算确认与申诉"]
  }
];

export function MiniappDemoPage() {
  const [role, setRole] = useState<DemoRole>("personal");
  const [frameVersion, setFrameVersion] = useState(0);
  const current = roleOptions.find((item) => item.id === role) ?? roleOptions[0]!;
  const src = useMemo(() => {
    const query = new URLSearchParams({ persona: current.id, redirect: current.route, embed: "1" });
    return `${portalOrigin}/entry?${query.toString()}`;
  }, [current]);

  return <main className="real-miniapp-demo">
    <section className="real-miniapp-heading">
      <div>
        <Space size={10} wrap>
          <Tag color="blue">同源数据</Tag>
          <Tag color="green">真实可交互</Tag>
          <Tag color="purple">手机端 390×844</Tag>
        </Space>
        <Typography.Title level={2}>真实小程序演示</Typography.Title>
        <Typography.Paragraph>
          此处直接运行祥能小程序，不再维护第二套静态演示。身份切换、岗位详情、人员状态、结算和 AI 入口均连接同一套 API 与 PostgreSQL 数据。
        </Typography.Paragraph>
      </div>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => setFrameVersion((value) => value + 1)}>刷新小程序</Button>
        <Button type="primary" icon={<FullscreenOutlined />} href={src} target="_blank" rel="noreferrer">独立打开</Button>
      </Space>
    </section>

    <div className="real-miniapp-layout">
      <aside className="real-miniapp-control">
        <Card title="选择演示身份" variant="borderless">
          <div className="real-miniapp-roles">
            {roleOptions.map((item) => <button key={item.id} type="button" className={item.id === role ? "is-active" : ""} onClick={() => { setRole(item.id); setFrameVersion((value) => value + 1); }}>
              <span>{item.icon}</span>
              <div><strong>{item.label}</strong><small>{item.subtitle}</small></div>
            </button>)}
          </div>
        </Card>
        <Card title={current.label} variant="borderless">
          <ul className="real-miniapp-checklist">{current.highlights.map((item) => <li key={item}><SafetyCertificateOutlined />{item}</li>)}</ul>
        </Card>
        <Alert type="info" showIcon title="演示说明" description="小程序中的手机号、身份证号和联系人信息按当前演示账号的数据权限完整显示；跨项目、跨供应商数据仍由后端权限拦截。" />
      </aside>

      <section className="real-miniapp-stage" aria-label={`${current.label}手机界面`}>
        <div className="real-phone-shadow" />
        <div className="real-phone-frame">
          <div className="real-phone-speaker" />
          <iframe key={`${role}-${frameVersion}`} title={`${current.label}小程序`} src={src} allow="clipboard-read; clipboard-write" />
          <div className="real-phone-home" />
        </div>
        <div className="real-miniapp-caption"><strong>{current.label}</strong><span>{current.subtitle}</span></div>
      </section>
    </div>
  </main>;
}
