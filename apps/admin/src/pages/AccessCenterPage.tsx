import { useEffect, useMemo, useState } from "react";
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { CheckOutlined, PlusOutlined, ReloadOutlined, StopOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Permission } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { api, getErrorMessage } from "../lib/api";

type Option = { id: string; code?: string; name?: string; username?: string; displayName?: string; type?: string };
type AccessOptions = { users: Option[]; roles: Option[]; orgUnits: Option[]; branches: Option[]; projects: Option[]; suppliers: Option[] };
type AccessRequest = {
  id: string; status: string; riskLevel: string; portals: string[]; roles: string[]; scopes: Array<{ type: string; entityId?: string | null }>;
  reason: string; validFrom: string; validTo?: string | null; createdAt: string;
  subjectUser: { id: string; username: string; displayName: string; isActive: boolean };
  requestedBy: { id: string; displayName: string }; reviewedBy?: { id: string; displayName: string } | null;
  workflowInstance?: { currentNodeKey?: string | null; tasks: Array<{ id: string; nodeName: string; nodeOrder: number; status: string }> } | null;
  canCurrentUserAct: boolean;
};
type FormValues = {
  subjectUserId: string; portals: string[]; roles: string[]; scopeType: string; scopeEntityId?: string;
  validity: [Dayjs, Dayjs | null]; reason: string;
};

const portalLabels: Record<string, string> = { ADMIN: "电脑管理后台", INTERNAL_MINIAPP: "内部管理端", SUPPLIER_MINIAPP: "供应商端", EMPLOYEE_MINIAPP: "员工/求职者端" };
const statusLabels: Record<string, string> = { DRAFT: "草稿", PENDING: "审批中", APPROVED: "已审批", REJECTED: "已驳回", PROVISIONING: "开通中", COMPLETED: "已开通", REVOKED: "已回收", FAILED: "失败" };
const scopeLabels: Record<string, string> = { SELF: "本人", ORG_UNIT: "指定业务部门", CENTER: "指定中心", BRANCH: "指定经营分公司", PROJECT: "指定项目", SUPPLIER: "指定供应商", GROUP: "集团全部" };

export function AccessCenterPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [form] = Form.useForm<FormValues>();
  const [options, setOptions] = useState<AccessOptions>({ users: [], roles: [], orgUnits: [], branches: [], projects: [], suppliers: [] });
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const scopeType = Form.useWatch("scopeType", form);

  const scopeOptions = useMemo(() => {
    if (scopeType === "CENTER") return options.orgUnits.filter((item) => item.type === "CENTER");
    if (scopeType === "ORG_UNIT") return options.orgUnits.filter((item) => ["DEPARTMENT", "BUSINESS_DEPARTMENT", "BRANCH", "SUBSIDIARY", "OTHER"].includes(item.type ?? ""));
    if (scopeType === "BRANCH") return options.branches;
    if (scopeType === "PROJECT") return options.projects;
    if (scopeType === "SUPPLIER") return options.suppliers;
    return [];
  }, [scopeType, options]);

  const reload = async () => {
    const [optionData, requests] = await Promise.all([
      api.get<AccessOptions>("/access-requests/options"), api.get<AccessRequest[]>("/access-requests")
    ]);
    setOptions(optionData); setItems(requests);
  };
  useEffect(() => { void reload().catch((error) => message.error(getErrorMessage(error))); }, []);

  const submit = async (values: FormValues) => {
    setLoading(true);
    try {
      await api.post("/access-requests", {
        subjectUserId: values.subjectUserId,
        portals: values.portals,
        roles: values.roles,
        scopes: [{ type: values.scopeType, entityId: values.scopeEntityId ?? null }],
        validFrom: values.validity[0].startOf("day").toISOString(),
        validTo: values.validity[1]?.endOf("day").toISOString() ?? null,
        reason: values.reason
      });
      message.success("权限申请已提交审批"); setOpen(false); form.resetFields(); await reload();
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const decision = async (id: string, value: "APPROVE" | "REJECT") => {
    try { await api.post(`/access-requests/${id}/decision`, { decision: value, comment: value === "APPROVE" ? "审批通过" : "审批驳回" }); message.success(value === "APPROVE" ? "当前审批环节已通过" : "申请已驳回"); await reload(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  const revoke = async (id: string) => {
    try { await api.post(`/access-requests/${id}/revoke`, { reason: "管理员手动回收权限" }); message.success("权限已回收"); await reload(); }
    catch (error) { message.error(getErrorMessage(error)); }
  };

  const columns = [
    { title: "申请对象", width: 150, render: (_: unknown, row: AccessRequest) => <><Typography.Text strong>{row.subjectUser.displayName}</Typography.Text><br /><Typography.Text type="secondary">{row.subjectUser.username}</Typography.Text></> },
    { title: "使用端口", width: 240, render: (_: unknown, row: AccessRequest) => <Space wrap>{row.portals.map((portal) => <Tag key={portal}>{portalLabels[portal] ?? portal}</Tag>)}</Space> },
    { title: "角色", width: 220, render: (_: unknown, row: AccessRequest) => row.roles.join("、") },
    { title: "数据范围", width: 160, render: (_: unknown, row: AccessRequest) => row.scopes.map((scope) => scopeLabels[scope.type] ?? scope.type).join("、") },
    { title: "当前环节", width: 150, render: (_: unknown, row: AccessRequest) => row.workflowInstance?.tasks.find((task) => task.status === "PENDING")?.nodeName ?? "—" },
    { title: "风险", dataIndex: "riskLevel", width: 90, render: (value: string) => <Tag color={value === "HIGH" ? "red" : "green"}>{value === "HIGH" ? "高权限" : "普通"}</Tag> },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <Tag color={value === "COMPLETED" ? "green" : value === "REJECTED" || value === "FAILED" ? "red" : "blue"}>{statusLabels[value] ?? value}</Tag> },
    { title: "申请原因", dataIndex: "reason", ellipsis: true },
    { title: "操作", fixed: "right" as const, width: 260, render: (_: unknown, row: AccessRequest) => <Space>
      {row.status === "PENDING" && row.canCurrentUserAct ? <><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => void decision(row.id, "APPROVE")}>审批通过</Button><Button size="small" danger icon={<StopOutlined />} onClick={() => void decision(row.id, "REJECT")}>驳回</Button></> : null}
      {row.status === "COMPLETED" && can(Permission.ACCOUNT_MANAGE) ? <Popconfirm title="确认回收该申请开通的全部权限？" onConfirm={() => void revoke(row.id)}><Button size="small" danger icon={<UndoOutlined />}>权限回收</Button></Popconfirm> : null}
    </Space> }
  ];

  return <>
    <PageHeader title="权限开通中心" description="权限申请、逐环节审批、自动开通、临时权限到期和精确回收统一管理。" />
    <ContentCard>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}><Typography.Title level={4}>权限申请与审批</Typography.Title><Space><Button icon={<ReloadOutlined />} onClick={() => void reload()}>刷新</Button>{can(Permission.ACCESS_REQUEST_CREATE) ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ portals: ["EMPLOYEE_MINIAPP"], roles: [], scopeType: "SELF", validity: [dayjs(), null], reason: "" }); setOpen(true); }}>新建权限申请</Button> : null}</Space></Space>
      <Table<AccessRequest> rowKey="id" dataSource={items} columns={columns} scroll={{ x: 1600 }} pagination={{ pageSize: 15 }} />
    </ContentCard>

    <Modal title="新建权限申请" width={760} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={loading} destroyOnHidden>
      <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item name="subjectUserId" label="开通对象" rules={[{ required: true, message: "请选择账户" }]}><Select showSearch optionFilterProp="label" options={options.users.map((user) => ({ value: user.id, label: `${user.displayName}（${user.username}）` }))} /></Form.Item>
        <Form.Item name="portals" label="使用端口" rules={[{ required: true }]}><Select mode="multiple" options={Object.entries(portalLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="roles" label="业务角色" rules={[{ required: true }]}><Select mode="multiple" options={options.roles.map((role) => ({ value: role.code, label: `${role.name}（${role.code}）` }))} /></Form.Item>
        <Space align="start" style={{ width: "100%" }}>
          <Form.Item name="scopeType" label="数据范围类型" rules={[{ required: true }]} style={{ width: 240 }}><Select options={Object.entries(scopeLabels).map(([value, label]) => ({ value, label }))} onChange={() => form.setFieldValue("scopeEntityId", undefined)} /></Form.Item>
          {scopeOptions.length ? <Form.Item name="scopeEntityId" label="具体范围" rules={[{ required: true }]} style={{ width: 360 }}><Select showSearch optionFilterProp="label" options={scopeOptions.map((item) => ({ value: item.id, label: `${item.name ?? item.displayName} ${item.code ? `（${item.code}）` : ""}` }))} /></Form.Item> : null}
        </Space>
        <Form.Item name="validity" label="权限有效期" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="reason" label="申请原因" rules={[{ required: true, min: 2 }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
      </Form>
    </Modal>
  </>;
}
