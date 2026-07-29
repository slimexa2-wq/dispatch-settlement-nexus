import { useEffect, useMemo, useState } from "react";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Timeline, Typography } from "antd";
import { DisconnectOutlined, HistoryOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, StopOutlined } from "@ant-design/icons";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { api, getAllPages, getErrorMessage, type PaginatedResult } from "../lib/api";

type PortalAccess = { portal: string; enabled: boolean; validFrom?: string | null; validTo?: string | null };
type AccountLifecycleLog = { id: string; action: string; portal?: string | null; reason?: string | null; createdAt: string; actor?: { id: string; displayName: string } | null };
type Account = {
  id: string; username: string; displayName: string; role: string; category: string; isActive: boolean; createdAt: string;
  wechatMiniappOpenId?: string | null; effectivePortals: PortalAccess[];
  internalEmployee?: { id: string; employeeNo: string; name: string } | null;
  person?: { id: string; name: string; phone: string; status: string; employeeNo?: string | null } | null;
  supplier?: { id: string; name: string } | null;
  roleAssignments: Array<{ id: string; role: { code: string; name: string }; validTo?: string | null }>;
  accountLifecycleLogs: AccountLifecycleLog[];
};
type SourceItem = { id: string; name: string; employeeNo?: string; phone?: string; contactName?: string };

const portalLabels: Record<string, string> = { ADMIN: "电脑后台", INTERNAL_MINIAPP: "内部管理端", SUPPLIER_MINIAPP: "供应商端", EMPLOYEE_MINIAPP: "员工/求职者端" };
const categoryLabels: Record<string, string> = { INTERNAL_EMPLOYEE: "内部员工", SUPPLIER: "供应商", OUTSOURCED_EMPLOYEE: "派遣外包员工", JOB_SEEKER: "求职者", SYSTEM: "系统账户" };
const actionLabels = { ACTIVATE: "启用账户", DISABLE: "停用账户", RESET_PASSWORD: "重置密码", FORCE_LOGOUT: "强制下线", UNBIND_WECHAT: "解绑微信" };
const lifecycleActionLabels: Record<string, string> = {
  CREATED: "创建账户", ACTIVATED: "启用账户", DISABLED: "停用账户", PASSWORD_RESET: "重置密码",
  FORCE_LOGOUT: "强制下线", WECHAT_BOUND: "绑定微信", WECHAT_UNBOUND: "解绑微信",
  PORTAL_GRANTED: "开通端口", PORTAL_REVOKED: "回收端口", ROLE_GRANTED: "授予角色", ROLE_REVOKED: "回收角色", MERGED: "合并账户"
};

type PortalForm = { portals: string[]; reason: string };
type BatchForm = { sourceType: "INTERNAL_EMPLOYEE" | "PERSON" | "SUPPLIER"; sourceIds: string[]; defaultPassword: string; portals: string[] };

export function AccountCenterPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [portalForm] = Form.useForm<PortalForm>();
  const [batchForm] = Form.useForm<BatchForm>();
  const [items, setItems] = useState<Account[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [keyword, setKeyword] = useState("");
  const [portal, setPortal] = useState<string>();
  const [category, setCategory] = useState<string>();
  const [editing, setEditing] = useState<Account>();
  const [portalOpen, setPortalOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [logAccount, setLogAccount] = useState<Account>();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const sourceType = Form.useWatch("sourceType", batchForm);

  const reload = async (page = pagination.page, pageSize = pagination.pageSize) => {
    const result = await api.get<PaginatedResult<Account>>("/account-center", { page, pageSize, keyword, portal, category });
    setItems(result.items); setPagination({ page: result.pagination.page, pageSize: result.pagination.pageSize, total: result.pagination.total });
  };
  useEffect(() => { void reload(1).catch((error) => message.error(getErrorMessage(error))); }, [portal, category]);

  const loadSources = async (type: BatchForm["sourceType"]) => {
    setLoading(true);
    try {
      if (type === "INTERNAL_EMPLOYEE") {
        const result = await getAllPages<any>("/internal-employees", { status: "ACTIVE" });
        setSources(result.items.map((item) => ({ id: item.id, name: item.name, employeeNo: item.employeeNo, phone: item.phone })));
      } else if (type === "PERSON") {
        const result = await getAllPages<any>("/people");
        setSources(result.items.map((item) => ({ id: item.id, name: item.name, employeeNo: item.employeeNo, phone: item.phone })));
      } else {
        const result = await getAllPages<any>("/suppliers");
        setSources(result.items.map((item) => ({ id: item.id, name: item.name, phone: item.contactPhone, contactName: item.contactName })));
      }
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const sourceOptions = useMemo(() => sources.map((item) => ({ value: item.id, label: `${item.name}${item.employeeNo ? `（${item.employeeNo}）` : item.phone ? `（${item.phone}）` : ""}` })), [sources]);

  const openPortals = (account: Account) => {
    setEditing(account);
    portalForm.setFieldsValue({ portals: account.effectivePortals.filter((item) => item.enabled).map((item) => item.portal), reason: "管理员调整各端口账户访问权限" });
    setPortalOpen(true);
  };

  const savePortals = async (values: PortalForm) => {
    if (!editing) return;
    if (editing.id === user?.id && !values.portals.includes("ADMIN")) {
      message.error("不能移除当前登录账户的电脑后台入口");
      return;
    }
    setLoading(true);
    try {
      const selected = new Set(values.portals);
      await api.patch(`/account-center/${editing.id}/portals`, {
        portals: Object.keys(portalLabels).map((portalKey) => ({ portal: portalKey, enabled: selected.has(portalKey) })),
        reason: values.reason
      });
      message.success("各端口访问权限已更新"); setPortalOpen(false); await reload();
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const action = async (account: Account, actionName: keyof typeof actionLabels, password?: string) => {
    try {
      await api.post(`/account-center/${account.id}/action`, { action: actionName, password, reason: `管理员执行：${actionLabels[actionName]}` });
      message.success(`${actionLabels[actionName]}成功`); await reload();
    } catch (error) { message.error(getErrorMessage(error)); }
  };

  const resetPassword = (account: Account) => {
    let password = "";
    Modal.confirm({
      title: `重置 ${account.displayName} 的密码`,
      content: <Input.Password autoFocus placeholder="输入至少8位的新密码" onChange={(event) => { password = event.target.value; }} />,
      okText: "确认重置",
      onOk: async () => {
        if (password.length < 8) { message.error("新密码至少8位"); return Promise.reject(); }
        await action(account, "RESET_PASSWORD", password);
      }
    });
  };

  const batchCreate = async (values: BatchForm) => {
    setLoading(true);
    try {
      const result = await api.post<{ created: unknown[]; skipped: unknown[]; failed: unknown[] }>("/account-center/batch-create", { ...values, skipExisting: true });
      message.success(`批量开户完成：创建${result.created.length}，跳过${result.skipped.length}，失败${result.failed.length}`);
      setBatchOpen(false); batchForm.resetFields(); await reload(1);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const columns = [
    { title: "账户", width: 180, render: (_: unknown, row: Account) => <><Typography.Text strong>{row.displayName}</Typography.Text><br /><Typography.Text type="secondary">{row.username}</Typography.Text></> },
    { title: "账户类别", dataIndex: "category", width: 130, render: (value: string) => <Tag>{categoryLabels[value] ?? value}</Tag> },
    { title: "各端口账户", width: 300, render: (_: unknown, row: Account) => <Space wrap>{row.effectivePortals.filter((item) => item.enabled).map((item) => <Tag color="blue" key={item.portal}>{portalLabels[item.portal] ?? item.portal}</Tag>)}{!row.effectivePortals.some((item) => item.enabled) ? "未开通" : null}</Space> },
    { title: "业务角色", width: 220, render: (_: unknown, row: Account) => row.roleAssignments.length ? row.roleAssignments.map((item) => item.role.name).join("、") : row.role },
    { title: "关联主体", width: 200, render: (_: unknown, row: Account) => row.internalEmployee ? `内部员工：${row.internalEmployee.employeeNo}` : row.supplier ? `供应商：${row.supplier.name}` : row.person ? `人员：${row.person.phone}` : "系统账户" },
    { title: "微信绑定", width: 100, render: (_: unknown, row: Account) => <Tag color={row.wechatMiniappOpenId ? "green" : "default"}>{row.wechatMiniappOpenId ? "已绑定" : "未绑定"}</Tag> },
    { title: "状态", dataIndex: "isActive", width: 90, render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "操作", fixed: "right" as const, width: 420, render: (_: unknown, row: Account) => <Space wrap>
      <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openPortals(row)}>端口权限</Button>
      <Button size="small" icon={<HistoryOutlined />} onClick={() => setLogAccount(row)}>操作记录</Button>
      <Button size="small" icon={<KeyOutlined />} onClick={() => resetPassword(row)}>重置密码</Button>
      <Button size="small" icon={<DisconnectOutlined />} onClick={() => void action(row, "FORCE_LOGOUT")}>强制下线</Button>
      {row.wechatMiniappOpenId ? <Popconfirm title="确认解绑微信？" onConfirm={() => void action(row, "UNBIND_WECHAT")}><Button size="small">解绑微信</Button></Popconfirm> : null}
      <Popconfirm disabled={row.id === user?.id && row.isActive} title={row.isActive ? "确认停用账户？" : "确认启用账户？"} onConfirm={() => void action(row, row.isActive ? "DISABLE" : "ACTIVATE")}><Button size="small" disabled={row.id === user?.id && row.isActive} danger={row.isActive} icon={<StopOutlined />}>{row.isActive ? "停用" : "启用"}</Button></Popconfirm>
    </Space> }
  ];

  return <>
    <PageHeader title="各端口账户管理" description="一个主账户统一管理电脑后台、内部管理端、供应商端和员工/求职者端的登录与权限。" />
    <ContentCard>
      <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Space wrap><Input.Search allowClear placeholder="账号、姓名、手机号、供应商" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void reload(1)} style={{ width: 280 }} /><Select allowClear placeholder="账户类别" value={category} onChange={setCategory} style={{ width: 160 }} options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))} /><Select allowClear placeholder="使用端口" value={portal} onChange={setPortal} style={{ width: 170 }} options={Object.entries(portalLabels).map(([value, label]) => ({ value, label }))} /></Space>
        <Space><Button icon={<ReloadOutlined />} onClick={() => void reload()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { batchForm.setFieldsValue({ sourceType: "INTERNAL_EMPLOYEE", sourceIds: [], defaultPassword: "", portals: ["INTERNAL_MINIAPP"] }); void loadSources("INTERNAL_EMPLOYEE"); setBatchOpen(true); }}>批量开户</Button></Space>
      </Space>
      <Table<Account> rowKey="id" dataSource={items} columns={columns} loading={loading} scroll={{ x: 1700 }} pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true }} onChange={(page) => void reload(page.current ?? 1, page.pageSize ?? 20)} />
    </ContentCard>

    <Modal title={`设置端口权限：${editing?.displayName ?? ""}`} open={portalOpen} onCancel={() => setPortalOpen(false)} onOk={() => portalForm.submit()} confirmLoading={loading} destroyOnHidden>
      <Form<PortalForm> form={portalForm} layout="vertical" onFinish={(values) => void savePortals(values)}>
        <Form.Item name="portals" label="允许登录的端口" rules={[{ required: true }]}><Select mode="multiple" options={Object.entries(portalLabels).map(([value, label]) => ({ value, label, disabled: editing?.id === user?.id && value === "ADMIN" }))} /></Form.Item>
        <Form.Item name="reason" label="调整原因" rules={[{ required: true, min: 2 }]}><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>

    <Modal title={`操作记录：${logAccount?.displayName ?? ""}`} width={720} open={Boolean(logAccount)} onCancel={() => setLogAccount(undefined)} footer={null} destroyOnHidden>
      {logAccount?.accountLifecycleLogs.length ? <Timeline items={logAccount.accountLifecycleLogs.map((log) => ({
        children: <div><Space wrap><Typography.Text strong>{lifecycleActionLabels[log.action] ?? log.action}</Typography.Text>{log.portal ? <Tag>{portalLabels[log.portal] ?? log.portal}</Tag> : null}<Typography.Text type="secondary">{new Date(log.createdAt).toLocaleString("zh-CN")}</Typography.Text></Space><div><Typography.Text>{log.reason || "无补充说明"}</Typography.Text>{log.actor?.displayName ? <Typography.Text type="secondary"> · 操作人：{log.actor.displayName}</Typography.Text> : null}</div></div>
      }))} /> : <Typography.Text type="secondary">暂无操作记录</Typography.Text>}
    </Modal>

    <Modal title="批量开户" width={720} open={batchOpen} onCancel={() => setBatchOpen(false)} onOk={() => batchForm.submit()} confirmLoading={loading} destroyOnHidden>
      <Form<BatchForm> form={batchForm} layout="vertical" onFinish={(values) => void batchCreate(values)}>
        <Form.Item name="sourceType" label="开户对象类型" rules={[{ required: true }]}><Select options={[{ value: "INTERNAL_EMPLOYEE", label: "内部员工" }, { value: "PERSON", label: "派遣外包员工/求职者" }, { value: "SUPPLIER", label: "供应商" }]} onChange={(value) => { batchForm.setFieldValue("sourceIds", []); void loadSources(value); }} /></Form.Item>
        <Form.Item name="sourceIds" label="选择开户对象" rules={[{ required: true }]}><Select mode="multiple" showSearch optionFilterProp="label" loading={loading} maxTagCount="responsive" options={sourceOptions} placeholder={`选择${sourceType ? "开户对象" : "对象类型"}`} /></Form.Item>
        <Form.Item name="portals" label="初始开通端口" rules={[{ required: true }]}><Select mode="multiple" options={Object.entries(portalLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="defaultPassword" label="统一初始密码" rules={[{ required: true, min: 8, message: "初始密码至少8位" }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Typography.Paragraph type="secondary">已有账户会自动跳过，不会重复创建。开户结果会返回成功、跳过和失败明细。</Typography.Paragraph>
      </Form>
    </Modal>
  </>;
}
