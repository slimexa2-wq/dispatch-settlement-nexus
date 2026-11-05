import { useMemo, useState } from "react";
import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { Permission, UserRole, labels } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { branchName, formatDateTime, listResult } from "../lib/format";
import type { AuditLog, Branch, ListResult, Project, Supplier, UserAccount } from "../types/domain";

type UserValues = {
  username: string;
  password?: string;
  displayName: string;
  role: UserRole;
  branchId?: string;
  supplierId?: string;
  personId?: string;
  projectIds?: string[];
  isActive?: boolean;
  employeeType?: string;
};

function SettingsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [activeTab, setActiveTab] = useState(can(Permission.USER_MANAGE) ? "users" : "audit");
  const [userPage, setUserPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [userKeyword, setUserKeyword] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditResourceType, setAuditResourceType] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount>();
  const [form] = Form.useForm<UserValues>();
  const [saving, setSaving] = useState(false);
  const role = Form.useWatch("role", form);

  const usersResource = useApiResource(
    () => can(Permission.USER_MANAGE) ? api.get<ListResult<UserAccount> | UserAccount[]>("/users", { page: userPage, pageSize, keyword: userKeyword }) : Promise.resolve([] as UserAccount[]),
    [userPage, pageSize, userKeyword, can(Permission.USER_MANAGE)]
  );
  const auditResource = useApiResource(
    () => can(Permission.AUDIT_READ) ? api.get<ListResult<AuditLog> | AuditLog[]>("/audit-logs", { page: auditPage, pageSize, action: auditAction, resourceType: auditResourceType }) : Promise.resolve([] as AuditLog[]),
    [auditPage, pageSize, auditAction, auditResourceType, can(Permission.AUDIT_READ)]
  );
  const projectsResource = useApiResource(() => getAllPages<Project>("/projects"), []);
  const branchesResource = useApiResource(() => getAllPages<Branch>("/branches"), []);
  const suppliersResource = useApiResource(() => getAllPages<Supplier>("/suppliers"), []);

  const users = usersResource.data ? listResult(usersResource.data, userPage, pageSize) : undefined;
  const audits = auditResource.data ? listResult(auditResource.data, auditPage, pageSize) : undefined;
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const branches = branchesResource.data ? listResult(branchesResource.data, 1, 200).items : [];
  const suppliers = suppliersResource.data ? listResult(suppliersResource.data, 1, 200).items : [];
  const branchOptions = useMemo(() => {
    const options = new Map<string, string>();
    branches.forEach((branch) => options.set(branch.id, branch.name));
    projects.forEach((project) => options.set(project.branchId, branchName(project)));
    return [...options.entries()].map(([value, label]) => ({ value, label }));
  }, [branches, projects]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ role: UserRole.PROJECT_OPERATOR, isActive: true, projectIds: [] });
    setUserOpen(true);
  };

  const openEdit = (user: UserAccount) => {
    setEditing(user);
    form.setFieldsValue({
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      branchId: user.branchId ?? undefined,
      supplierId: user.supplierId ?? undefined,
      personId: user.personId ?? undefined,
      projectIds: user.projectIds ?? [],
      isActive: user.isActive !== false,
      employeeType: user.employeeType ?? undefined
    });
    setUserOpen(true);
  };

  const saveUser = async (values: UserValues) => {
    setSaving(true);
    try {
      if (editing) {
        const body = { ...values };
        if (!body.password) delete body.password;
        await api.patch(`/users/${editing.id}`, body);
      } else {
        await api.post("/users", values);
      }
      message.success(editing ? "账号已更新" : "账号已创建");
      setUserOpen(false);
      await usersResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const userColumns: TableColumnsType<UserAccount> = [
    { title: "账号", dataIndex: "username", width: 150 },
    { title: "显示名称", dataIndex: "displayName", width: 140 },
    { title: "角色", dataIndex: "role", width: 160, render: (value: UserRole) => <Tag color="cyan">{labels.roles[value]}</Tag> },
    { title: "分子公司范围", width: 170, render: (_, row) => branchOptions.find((item) => item.value === row.branchId)?.label ?? "—" },
    { title: "项目范围", width: 240, render: (_, row) => row.projectIds?.length ? row.projectIds.map((id) => projects.find((project) => project.id === id)?.name ?? id).join("、") : "—" },
    { title: "供应商范围", width: 170, render: (_, row) => suppliers.find((supplier) => supplier.id === row.supplierId)?.name ?? "—" },
    { title: "状态", dataIndex: "isActive", width: 90, render: (value: boolean | undefined) => <Tag color={value === false ? "default" : "green"}>{value === false ? "停用" : "启用"}</Tag> },
    { title: "操作", fixed: "right", width: 90, render: (_, row) => <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button> }
  ];

  const auditColumns: TableColumnsType<AuditLog> = [
    { title: "时间", dataIndex: "createdAt", width: 160, render: (value: string) => formatDateTime(value) },
    { title: "操作人", width: 130, render: (_, row) => row.actor?.displayName || row.actor?.username || "系统" },
    { title: "动作", dataIndex: "action", width: 180 },
    { title: "对象类型", dataIndex: "resourceType", width: 120, render: (value: string | null) => value || "—" },
    { title: "对象 ID", dataIndex: "resourceId", width: 230, ellipsis: { showTitle: true }, render: (value: string | null) => value || "—" },
    { title: "变更摘要", width: 320, ellipsis: { showTitle: true }, render: (_, row) => row.after ? JSON.stringify(row.after) : row.before ? JSON.stringify(row.before) : "—" },
    { title: "IP", dataIndex: "ipAddress", width: 140, render: (value: string | null) => value || "—" }
  ];

  if (!can(Permission.USER_MANAGE) && !can(Permission.AUDIT_READ)) {
    return <Result status="403" title="无权访问" subTitle="当前账号没有系统设置或审计日志权限。" />;
  }

  return (
    <>
      <PageHeader title="权限与审计" description="角色决定功能权限，分子公司、项目和供应商范围决定可见业务数据。" />
      <ContentCard>
        <Alert type="info" showIcon title="权限最小化原则" description="账号仅授予完成职责所需的角色与数据范围；关键业务修改自动写入审计日志。" className="table-alert" />
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            ...(can(Permission.USER_MANAGE) ? [{
              key: "users",
              label: "账号与权限",
              children: <>
                <div className="table-toolbar"><Input.Search allowClear placeholder="账号 / 显示名称" value={userKeyword} onChange={(event) => setUserKeyword(event.target.value)} onSearch={() => setUserPage(1)} /><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建账号</Button></div>
                {usersResource.error && !users ? <ErrorBlock error={usersResource.error} onRetry={() => void usersResource.reload()} /> : <Table<UserAccount> rowKey="id" columns={userColumns} dataSource={users?.items ?? []} loading={usersResource.loading} scroll={{ x: 1400 }} pagination={{ current: userPage, pageSize, total: users?.pagination.total ?? 0, showSizeChanger: true }} onChange={(pagination) => { setUserPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }} locale={{ emptyText: "暂无账号" }} />}
              </>
            }] : []),
            ...(can(Permission.AUDIT_READ) ? [{
              key: "audit",
              label: "操作审计",
              children: <>
                <div className="table-toolbar"><Space wrap><Input allowClear placeholder="动作，如 PERSON_ONBOARD" value={auditAction} onChange={(event) => { setAuditAction(event.target.value); setAuditPage(1); }} /><Input allowClear placeholder="对象类型，如 Person" value={auditResourceType} onChange={(event) => { setAuditResourceType(event.target.value); setAuditPage(1); }} /></Space><Button icon={<ReloadOutlined />} onClick={() => void auditResource.reload()}>刷新</Button></div>
                {auditResource.error && !audits ? <ErrorBlock error={auditResource.error} onRetry={() => void auditResource.reload()} /> : <Table<AuditLog> rowKey="id" columns={auditColumns} dataSource={audits?.items ?? []} loading={auditResource.loading} scroll={{ x: 1300 }} pagination={{ current: auditPage, pageSize, total: audits?.pagination.total ?? 0, showSizeChanger: true }} onChange={(pagination) => { setAuditPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }} locale={{ emptyText: "暂无审计记录" }} />}
              </>
            }] : [])
          ]}
        />
      </ContentCard>

      <Modal title={editing ? "编辑账号与权限" : "新建账号"} width={720} open={userOpen} confirmLoading={saving} onCancel={() => setUserOpen(false)} onOk={() => form.submit()} destroyOnHidden>
        <Form<UserValues> form={form} layout="vertical" onFinish={(values) => void saveUser(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }, { min: 2, max: 64 }]}><Input disabled={Boolean(editing)} /></Form.Item>
            <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: "请输入显示名称" }]}><Input maxLength={64} /></Form.Item>
            <Form.Item name="password" label={editing ? "重置密码（留空不修改）" : "初始密码"} rules={editing ? [{ min: 8, message: "密码至少 8 位" }] : [{ required: true, min: 8, message: "密码至少 8 位" }]}><Input.Password autoComplete="new-password" /></Form.Item>
            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}><Select options={Object.entries(labels.roles).map(([value, label]) => ({ value, label }))} /></Form.Item>
            {role === UserRole.BRANCH_MANAGER ? <Form.Item name="branchId" label="分子公司范围" rules={[{ required: true, message: "请选择分子公司" }]}><ReferenceSelect options={branchOptions} loading={branchesResource.loading} /></Form.Item> : null}
            {role === UserRole.PROJECT_OPERATOR ? <Form.Item name="projectIds" label="负责项目" rules={[{ required: true, message: "请选择至少一个项目" }]}><ReferenceSelect mode="multiple" options={projects.map((project) => ({ value: project.id, label: project.name }))} loading={projectsResource.loading} /></Form.Item> : null}
            {role === UserRole.SUPPLIER ? <Form.Item name="supplierId" label="绑定供应商" rules={[{ required: true, message: "请选择供应商" }]}><ReferenceSelect options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} loading={suppliersResource.loading} /></Form.Item> : null}
            {(role === UserRole.EMPLOYEE || role === UserRole.JOB_SEEKER) ? <Form.Item name="personId" label="绑定人员档案 ID" rules={[{ required: true, message: "请输入人员档案 ID" }]}><Input /></Form.Item> : null}
            {(role === UserRole.EMPLOYEE || role === UserRole.PROJECT_OPERATOR) ? <Form.Item name="employeeType" label="员工类型"><Input maxLength={64} placeholder="用于内部推荐政策匹配" /></Form.Item> : null}
            <Form.Item name="isActive" label="账号状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
          </div>
          <Typography.Paragraph type="secondary">角色权限由系统统一字典控制，项目、分子公司和供应商数据范围不能使用自由文本配置。</Typography.Paragraph>
        </Form>
      </Modal>
    </>
  );
}

export function SettingsPage() {
  return <SettingsContent />;
}
