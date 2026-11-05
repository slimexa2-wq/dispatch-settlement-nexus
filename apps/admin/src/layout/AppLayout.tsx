import { useState } from "react";
import {
  ApartmentOutlined,
  AccountBookOutlined,
  AuditOutlined,
  BankOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  CrownOutlined,
  DollarOutlined,
  DownloadOutlined,
  FileProtectOutlined,
  GlobalOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UploadOutlined,
  UsergroupAddOutlined
} from "@ant-design/icons";
import { App, Button, Drawer, Dropdown, Grid, Layout, Menu, Select, Space, Tag, Typography } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import { Permission, UserRole } from "@xiangneng/shared";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { demoRoleOptions, useAuth, type DemoRoleKey } from "../auth/AuthContext";
import { AdminAiDrawer } from "../components/AdminAiDrawer";
import { api, getErrorMessage, saveBlob, type Query } from "../lib/api";

const { Header, Sider, Content } = Layout;

const roleLabels: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: "超级管理员",
  [UserRole.GROUP_LEADER]: "集团领导",
  [UserRole.DEPARTMENT_MANAGER]: "部门负责人",
  [UserRole.INTERNAL_HR]: "内部人事",
  [UserRole.RECRUITER]: "招聘专员",
  [UserRole.FINANCE_REVIEWER]: "财务审核",
  [UserRole.CASHIER]: "出纳",
  [UserRole.DEPARTMENT_REIMBURSEMENT_CLERK]: "部门报销制单人",
  [UserRole.SUPPLIER_ADMIN]: "供应商管理员",
  [UserRole.OUTSOURCED_EMPLOYEE]: "外包员工",
  [UserRole.HEADQUARTERS_MANAGER]: "总部管理员",
  [UserRole.BRANCH_MANAGER]: "分子公司负责人",
  [UserRole.PROJECT_OPERATOR]: "项目运营",
  [UserRole.RESOURCE_SPECIALIST]: "资源专员",
  [UserRole.SUPPLIER]: "供应商",
  [UserRole.EMPLOYEE]: "内部员工",
  [UserRole.JOB_SEEKER]: "求职者",
  [UserRole.SYSTEM_ADMIN]: "系统管理员"
};

const menuItems: ItemType[] = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "数据首页" },
  { key: "/people", icon: <TeamOutlined />, label: "人员管理" },
  { key: "/projects", icon: <ApartmentOutlined />, label: "项目管理" },
  { key: "/suppliers", icon: <BankOutlined />, label: "供应商管理" },
  {
    key: "policies",
    icon: <SafetyCertificateOutlined />,
    label: "政策管理",
    children: [
      { key: "/policies/supplier", label: "供应商政策" },
      { key: "/policies/referral", label: "内部推荐政策" }
    ]
  },
  {
    key: "recruitment",
    icon: <UsergroupAddOutlined />,
    label: "招聘管理",
    children: [
      { key: "/recruitment/demands", label: "招聘需求" },
      { key: "/recruitment/progress", label: "报名与招聘进度" },
      { key: "/recruitment/rewards", label: "推荐奖励审核" }
    ]
  },
  { key: "/salary-slips", icon: <DollarOutlined />, label: "工资条管理" },
  { key: "/electronic-contracts", icon: <FileProtectOutlined />, label: "电子合同管理" },
  { key: "/imports", icon: <DatabaseOutlined />, label: "数据导入" },
  { key: "/settings", icon: <AuditOutlined />, label: "权限与审计" },
  { key: "/miniapp-demo", icon: <MobileOutlined />, label: "小程序演示" },
  { key: "/ai-assistant", icon: <RobotOutlined />, label: "AI 助手" },
  { key: "/product", icon: <GlobalOutlined />, label: "产品介绍" },
  { key: "/internal-employees", icon: <IdcardOutlined />, label: "内部员工" },
  { key: "/reimbursements", icon: <AccountBookOutlined />, label: "报销管理" },
  { key: "/leadership", icon: <CrownOutlined />, label: "领导驾驶舱" }
];

type ModuleActionConfig = {
  key: string;
  label: string;
  exportPath?: string;
  exportQuery?: Query;
  exportPermission?: Permission;
  importable?: boolean;
};

function selectedPath(pathname: string): string {
  const paths = [
    "/dashboard",
    "/leadership",
    "/people",
    "/internal-employees",
    "/reimbursements",
    "/projects",
    "/suppliers",
    "/policies/supplier",
    "/policies/referral",
    "/recruitment/demands",
    "/recruitment/progress",
    "/recruitment/rewards",
    "/salary-slips",
    "/electronic-contracts",
    "/imports",
    "/settings",
    "/miniapp-demo"
  ];
  return paths.find((path) => pathname.startsWith(path)) ?? "/dashboard";
}

function moduleConfig(pathname: string): ModuleActionConfig | undefined {
  if (pathname.startsWith("/dashboard")) return { key: "dashboard", label: "首页数据", exportPath: "/statistics/export", exportPermission: Permission.DASHBOARD_READ };
  if (pathname.startsWith("/people")) return { key: "people", label: "人员数据", exportPath: "/people/export", exportPermission: Permission.PEOPLE_EXPORT, importable: true };
  if (pathname.startsWith("/projects")) return { key: "projects", label: "项目数据", exportPath: "/projects/export", exportPermission: Permission.PROJECT_READ, importable: true };
  if (pathname.startsWith("/suppliers")) return { key: "suppliers", label: "供应商数据", exportPath: "/suppliers/export", exportPermission: Permission.SUPPLIER_READ, importable: true };
  if (pathname.startsWith("/policies/supplier")) return { key: "supplier-policies", label: "供应商政策", exportPath: "/policies/export", exportQuery: { type: "SUPPLIER" }, exportPermission: Permission.POLICY_READ, importable: true };
  if (pathname.startsWith("/policies/referral")) return { key: "referral-policies", label: "内部推荐政策", exportPath: "/policies/export", exportQuery: { type: "EMPLOYEE_REFERRAL" }, exportPermission: Permission.POLICY_READ, importable: true };
  if (pathname.startsWith("/recruitment/demands")) return { key: "job-demands", label: "招聘需求", exportPath: "/job-demands/export", exportPermission: Permission.JOB_READ, importable: true };
  if (pathname.startsWith("/recruitment/progress")) return { key: "applications", label: "报名进度", exportPath: "/applications/export", exportPermission: Permission.JOB_READ, importable: true };
  if (pathname.startsWith("/recruitment/rewards")) return { key: "referral-rewards", label: "推荐奖励", exportPath: "/referral-rewards/export", exportPermission: Permission.REWARD_REVIEW, importable: true };
  if (pathname.startsWith("/salary-slips")) return { key: "salary-slips", label: "工资条", exportPath: "/salary-slips/export", exportPermission: Permission.SALARY_MANAGE, importable: true };
  if (pathname.startsWith("/electronic-contracts")) return { key: "electronic-contracts", label: "电子合同", exportPermission: Permission.CONTRACT_MANAGE };
  return undefined;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand-compact" : ""}`}>
      <div className="brand-mark">X</div>
      {!compact ? (
        <div>
          <div className="brand-name">祥能人员与招聘信息管理系统</div>
          <div className="brand-subtitle">人力组织与招聘业务后台</div>
        </div>
      ) : null}
    </div>
  );
}

export function AppLayout() {
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const screens = Grid.useBreakpoint();
  const desktop = Boolean(screens.lg);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, can, demoRole, switchDemoRole, isDemo } = useAuth();
  const selected = selectedPath(location.pathname);
  const currentModule = moduleConfig(location.pathname);

  const visibleMenuItems: ItemType[] = [
    ...(can(Permission.LEADERSHIP_DASHBOARD_READ) ? [menuItems[15]!] : []),
    ...(can(Permission.DASHBOARD_READ) ? [menuItems[0]!] : []),
    ...(can(Permission.PEOPLE_READ) ? [menuItems[1]!] : []),
    ...(can(Permission.INTERNAL_EMPLOYEE_READ) ? [menuItems[13]!] : []),
    ...([
      Permission.REIMBURSEMENT_SELF,
      Permission.REIMBURSEMENT_MANAGE,
      Permission.REIMBURSEMENT_APPROVE,
      Permission.REIMBURSEMENT_FINANCE_REVIEW,
      Permission.REIMBURSEMENT_PAY,
      Permission.REIMBURSEMENT_EXPORT
    ].some(can) ? [menuItems[14]!] : []),
    ...(can(Permission.PROJECT_READ) ? [menuItems[2]!] : []),
    ...(can(Permission.SUPPLIER_READ) ? [menuItems[3]!] : []),
    ...(can(Permission.POLICY_READ) ? [menuItems[4]!] : []),
    ...(can(Permission.JOB_READ) || can(Permission.REWARD_REVIEW) ? [{
      key: "recruitment",
      icon: <UsergroupAddOutlined />,
      label: "招聘管理",
      children: [
        ...(can(Permission.JOB_READ) ? [
          { key: "/recruitment/demands", label: "招聘需求" },
          { key: "/recruitment/progress", label: "报名与招聘进度" }
        ] : []),
        ...(can(Permission.REWARD_REVIEW) ? [{ key: "/recruitment/rewards", label: "推荐奖励审核" }] : [])
      ]
    }] : []),
    ...(can(Permission.SALARY_MANAGE) ? [menuItems[6]!] : []),
    ...(can(Permission.CONTRACT_MANAGE) ? [menuItems[7]!] : []),
    ...(can(Permission.IMPORT_MANAGE) ? [menuItems[8]!] : []),
    ...(can(Permission.USER_MANAGE) || can(Permission.AUDIT_READ) ? [menuItems[9]!] : []),
    ...(can(Permission.DASHBOARD_READ) ? [menuItems[10]!] : []),
    menuItems[11]!, // AI 助手
    menuItems[12]!  // 产品介绍
  ];

  const exportCurrentModule = async () => {
    if (!currentModule?.exportPath) return;
    setExporting(true);
    try {
      const result = await api.download(currentModule.exportPath, currentModule.exportQuery);
      saveBlob(result.blob, result.fileName);
      message.success(`${currentModule.label}导出已开始下载`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const onSwitchDemoRole = async (role: DemoRoleKey) => {
    try {
      await switchDemoRole(role);
      const target = role === "employee" || role === "candidate" ? "/miniapp-demo" : "/dashboard";
      navigate(target, { replace: true });
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const resetDemoData = async () => {
    setResettingDemo(true);
    try {
      await api.post("/ai/demo/reset", {});
      message.success("已恢复初始演示数据");
      window.location.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
      setResettingDemo(false);
    }
  };

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      items={visibleMenuItems}
      selectedKeys={[selected]}
      defaultOpenKeys={selected.startsWith("/policies") ? ["policies"] : selected.startsWith("/recruitment") ? ["recruitment"] : []}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <Layout className="app-shell">
      {desktop ? (
        <Sider width={236} collapsedWidth={76} collapsed={collapsed} trigger={null}>
          <Brand compact={collapsed} />
          {menu}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          size={268}
          open={drawerOpen}
          closable={false}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0, background: "#073b7a" } }}
        >
          <Brand />
          {menu}
        </Drawer>
      )}
      <Layout>
        <Header className="app-header">
          <Button
            type="text"
            aria-label={desktop ? "折叠侧边栏" : "打开菜单"}
            icon={desktop ? (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />) : <MenuUnfoldOutlined />}
            onClick={() => (desktop ? setCollapsed((value) => !value) : setDrawerOpen(true))}
          />
          <div className="header-search">搜索人员、项目、岗位、供应商等</div>
          <div className="header-spacer" />
          {isDemo ? (
            <Space className="demo-role-switch" size={8}>
              <Select
                size="middle"
                value={demoRole}
                options={demoRoleOptions}
                onChange={(role) => void onSwitchDemoRole(role)}
                style={{ width: 136 }}
              />
              <Button size="middle" loading={resettingDemo} onClick={() => void resetDemoData()}>恢复初始演示数据</Button>
            </Space>
          ) : null}
          {currentModule ? (
            <Space className="module-io-actions">
              {currentModule.importable && can(Permission.IMPORT_MANAGE) ? (
                <Button icon={<UploadOutlined />} onClick={() => navigate(`/imports?module=${currentModule.key}`)}>导入</Button>
              ) : null}
              {currentModule.exportPath && (!currentModule.exportPermission || can(currentModule.exportPermission)) ? (
                <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportCurrentModule()}>导出</Button>
              ) : null}
            </Space>
          ) : null}
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "退出登录",
                  onClick: () => {
                    logout();
                    navigate("/login", { replace: true });
                  }
                }
              ]
            }}
            placement="bottomRight"
          >
            <Button type="text" className="user-menu">
              <Space>
                <span className="user-name">{user?.displayName ?? "用户"}</span>
                {user ? <Tag color="blue">{roleLabels[user.role] ?? user.role}</Tag> : null}
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
        <footer className="app-footer">
          <Typography.Text type="secondary">© 2026 祥能人员与招聘信息管理系统 V2.0</Typography.Text>
        </footer>
      </Layout>
      <AdminAiDrawer />
    </Layout>
  );
}
