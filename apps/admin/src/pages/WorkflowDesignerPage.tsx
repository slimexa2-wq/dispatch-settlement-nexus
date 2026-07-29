import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Col, Divider, Empty, Form, Input, InputNumber, Row, Select, Space, Switch, Tag, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { api, getErrorMessage } from "../lib/api";

type AssigneeType = "USER" | "ROLE" | "POSITION" | "DEPARTMENT_MANAGER" | "DIRECT_MANAGER" | "FINANCE_REVIEWER" | "SYSTEM_ADMIN";
type WorkflowCondition = { field: string; operator: "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE" | "IN" | "CONTAINS"; value: unknown };
type WorkflowNode = {
  key: string; type: "START" | "APPROVAL" | "CC" | "END"; name: string;
  assignee?: { type: AssigneeType; refId?: string | null }; mode?: "ANY" | "ALL";
  conditions?: WorkflowCondition[];
  allowReturn?: boolean; timeoutHours?: number | null;
};
type Definition = { name: string; nodes: WorkflowNode[] };
type WorkflowVersion = { id: string; version: number; isPublished: boolean; definition: Definition; publishedAt?: string | null };
type WorkflowTemplate = { id: string; code: string; name: string; businessType: string; description?: string | null; status: string; versions: WorkflowVersion[] };

type DesignerMeta = { code: string; name: string; businessType: string; description?: string };
type DesignerOptions = { users: Array<{ id: string; username: string; displayName: string }>; roles: Array<{ id: string; code: string; name: string }>; positions: Array<{ id: string; code: string; name: string }> };

const assigneeOptions = [
  { value: "DEPARTMENT_MANAGER", label: "部门负责人" }, { value: "DIRECT_MANAGER", label: "直属上级" },
  { value: "FINANCE_REVIEWER", label: "财务审核" }, { value: "SYSTEM_ADMIN", label: "系统管理员" },
  { value: "ROLE", label: "指定角色" }, { value: "POSITION", label: "指定岗位" }, { value: "USER", label: "指定人员" }
];

const conditionFieldOptions = [
  { value: "amount", label: "金额" },
  { value: "riskLevel", label: "风险等级" },
  { value: "organizationUnitId", label: "组织/部门" },
  { value: "branchId", label: "经营分公司" },
  { value: "projectId", label: "项目" },
  { value: "supplierId", label: "供应商" },
  { value: "role", label: "发起人角色" },
  { value: "dataScopeType", label: "数据范围" }
];
const conditionOperatorOptions = [
  { value: "EQ", label: "等于" }, { value: "NE", label: "不等于" },
  { value: "GT", label: "大于" }, { value: "GTE", label: "大于等于" },
  { value: "LT", label: "小于" }, { value: "LTE", label: "小于等于" },
  { value: "IN", label: "属于（多个值用逗号分隔）" },
  { value: "CONTAINS", label: "包含" }
];

const businessOptions = [
  { value: "ACCESS_REQUEST", label: "权限开通" }, { value: "REIMBURSEMENT", label: "报销审批" },
  { value: "SUPPLIER_ONBOARDING", label: "供应商准入" }, { value: "EMPLOYEE_TRANSFER", label: "员工调动" },
  { value: "EMPLOYEE_OFFBOARD", label: "员工离职" }, { value: "SALARY_PUBLISH", label: "工资条发布" },
  { value: "CUSTOM", label: "其他业务" }
];

function freshDefinition(name = "新审批流程"): Definition {
  return { name, nodes: [{ key: "start", type: "START", name: "发起申请" }, { key: "end", type: "END", name: "流程完成" }] };
}

function prepareDefinition(definition: Definition, name: string): Definition {
  return {
    ...definition,
    name,
    nodes: definition.nodes.map((node) => ({
      ...node,
      conditions: node.conditions?.map((condition) => ({
        ...condition,
        value: condition.operator === "IN" && typeof condition.value === "string"
          ? condition.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean)
          : condition.value
      }))
    }))
  };
}

export function WorkflowDesignerPage() {
  const { message, modal } = App.useApp();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [meta, setMeta] = useState<DesignerMeta>({ code: "", name: "", businessType: "ACCESS_REQUEST", description: "" });
  const [definition, setDefinition] = useState<Definition>(freshDefinition());
  const [designerOptions, setDesignerOptions] = useState<DesignerOptions>({ users: [], roles: [], positions: [] });
  const [simulation, setSimulation] = useState<Array<{ nodeKey: string; nodeName: string; status: string; reason: string }>>([]);
  const [simulationContext, setSimulationContext] = useState<{ amount?: number; riskLevel?: string }>({ amount: 1000, riskLevel: "NORMAL" });
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => templates.find((item) => item.id === selectedId), [templates, selectedId]);

  const reload = async () => {
    const [items, options] = await Promise.all([
      api.get<WorkflowTemplate[]>("/workflow-templates"),
      api.get<DesignerOptions>("/workflow-templates/options")
    ]);
    setTemplates(items);
    setDesignerOptions(options);
    if (!selectedId && items[0]) loadTemplate(items[0]);
  };

  useEffect(() => { void reload().catch((error) => message.error(getErrorMessage(error))); }, []);

  const loadTemplate = (template: WorkflowTemplate) => {
    const version = template.versions[0];
    setSelectedId(template.id);
    setMeta({ code: template.code, name: template.name, businessType: template.businessType, description: template.description ?? "" });
    setDefinition(version?.definition ?? freshDefinition(template.name));
    setSimulation([]);
  };

  const createNew = () => {
    setSelectedId(undefined);
    setMeta({ code: "", name: "", businessType: "ACCESS_REQUEST", description: "" });
    setDefinition(freshDefinition());
    setSimulation([]);
  };

  const updateNode = (index: number, patch: Partial<WorkflowNode>) => setDefinition((current) => ({
    ...current, nodes: current.nodes.map((node, nodeIndex) => nodeIndex === index ? { ...node, ...patch } : node)
  }));

  const toggleCondition = (index: number, enabled: boolean) => updateNode(index, {
    conditions: enabled ? [{ field: "amount", operator: "GTE", value: 0 }] : []
  });

  const updateCondition = (index: number, patch: Partial<WorkflowCondition>) => setDefinition((current) => ({
    ...current,
    nodes: current.nodes.map((node, nodeIndex) => {
      if (nodeIndex !== index) return node;
      const condition = node.conditions?.[0] ?? { field: "amount", operator: "GTE", value: 0 };
      return { ...node, conditions: [{ ...condition, ...patch }] };
    })
  }));

  const addApproval = () => setDefinition((current) => {
    const node: WorkflowNode = {
      key: `approval_${Date.now()}`, type: "APPROVAL", name: `审批环节${current.nodes.length - 1}`,
      assignee: { type: "DEPARTMENT_MANAGER" }, mode: "ANY", allowReturn: true, conditions: [], timeoutHours: 24
    };
    return { ...current, nodes: [...current.nodes.slice(0, -1), node, current.nodes.at(-1)!] };
  });

  const move = (index: number, direction: -1 | 1) => setDefinition((current) => {
    const target = index + direction;
    if (target <= 0 || target >= current.nodes.length - 1) return current;
    const nodes = [...current.nodes];
    [nodes[index], nodes[target]] = [nodes[target]!, nodes[index]!];
    return { ...current, nodes };
  });

  const remove = (index: number) => setDefinition((current) => ({ ...current, nodes: current.nodes.filter((_, nodeIndex) => nodeIndex !== index) }));

  const saveDraft = async (): Promise<{ templateId: string; versionId: string }> => {
    if (!meta.name.trim() || !meta.businessType || (!selectedId && !meta.code.trim())) throw new Error("请填写流程名称、业务类型和流程编码");
    const finalDefinition = prepareDefinition(definition, meta.name);
    if (selectedId) {
      const version = await api.post<WorkflowVersion>(`/workflow-templates/${selectedId}/versions`, { definition: finalDefinition });
      return { templateId: selectedId, versionId: version.id };
    }
    const created = await api.post<WorkflowTemplate>("/workflow-templates", { ...meta, code: meta.code.trim().toUpperCase(), definition: finalDefinition });
    const version = created.versions[0];
    if (!version) throw new Error("流程版本创建失败");
    setSelectedId(created.id);
    return { templateId: created.id, versionId: version.id };
  };

  const save = async () => {
    setSaving(true);
    try { await saveDraft(); message.success("审批流程草稿已保存"); await reload(); }
    catch (error) { message.error(getErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const publish = () => modal.confirm({
    title: "发布当前审批流程？",
    content: "发布后，新发起的业务使用这个版本；已经在审批中的单据继续使用旧版本。",
    okText: "发布流程",
    onOk: async () => {
      setSaving(true);
      try {
        const saved = await saveDraft();
        await api.post(`/workflow-templates/${saved.templateId}/publish`, { versionId: saved.versionId });
        message.success("审批流程已发布");
        await reload();
      } finally { setSaving(false); }
    }
  });

  const simulate = async () => {
    try {
      const result = await api.post<{ errors: Array<{ message: string }>; simulation: { steps: Array<{ nodeKey: string; nodeName: string; status: string; reason: string }> } }>("/workflow-templates/simulate", { definition: prepareDefinition(definition, meta.name || definition.name), context: simulationContext });
      if (result.errors.length) return message.error(result.errors.map((item) => item.message).join("；"));
      setSimulation(result.simulation.steps);
      message.success("流程预览完成");
    } catch (error) { message.error(getErrorMessage(error)); }
  };

  return <>
    <PageHeader title="审批流程快速搭建" description="管理员按顺序添加审批环节，设置谁来审批、是否允许退回和适用条件，预览后即可发布。" />
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={7}>
        <ContentCard>
          <Space style={{ width: "100%", justifyContent: "space-between" }}><Typography.Title level={4}>审批流程</Typography.Title><Button type="primary" onClick={createNew}>新建</Button></Space>
          {templates.length ? templates.map((item) => <Card key={item.id} size="small" hoverable onClick={() => loadTemplate(item)} style={{ marginBottom: 10, borderColor: selectedId === item.id ? "#1677ff" : undefined }}>
            <Space style={{ width: "100%", justifyContent: "space-between" }}><div><Typography.Text strong>{item.name}</Typography.Text><br /><Typography.Text type="secondary">{businessOptions.find((option) => option.value === item.businessType)?.label ?? item.businessType}</Typography.Text></div><Tag color={item.status === "PUBLISHED" ? "green" : "default"}>{item.status === "PUBLISHED" ? "已发布" : "草稿"}</Tag></Space>
          </Card>) : <Empty description="暂无流程" />}
        </ContentCard>
      </Col>
      <Col xs={24} xl={17}>
        <ContentCard>
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={8}><Form.Item label="流程名称" required><Input value={meta.name} onChange={(event) => setMeta((current) => ({ ...current, name: event.target.value }))} placeholder="例如：报销审批" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="流程编码" required><Input disabled={Boolean(selectedId)} value={meta.code} onChange={(event) => setMeta((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="REIMBURSEMENT" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="适用业务" required><Select value={meta.businessType} onChange={(value) => setMeta((current) => ({ ...current, businessType: value }))} options={businessOptions} /></Form.Item></Col>
            </Row>
            <Form.Item label="说明"><Input value={meta.description} onChange={(event) => setMeta((current) => ({ ...current, description: event.target.value }))} /></Form.Item>
          </Form>
          <Divider orientation="left">审批环节设置</Divider>
          <div className="workflow-step-list">
            {definition.nodes.map((node, index) => <Card key={node.key} size="small" className="workflow-step-card" style={{ marginBottom: 12 }}>
              <Row gutter={[12, 12]} align="middle">
                <Col flex="40px"><Tag color={node.type === "APPROVAL" ? "blue" : "default"}>{index + 1}</Tag></Col>
                <Col xs={24} md={6}><Input disabled={node.type !== "APPROVAL"} value={node.name} onChange={(event) => updateNode(index, { name: event.target.value })} /></Col>
                {node.type === "APPROVAL" ? <>
                  <Col xs={24} md={5}><Select style={{ width: "100%" }} value={node.assignee?.type} options={assigneeOptions} onChange={(value: AssigneeType) => updateNode(index, { assignee: { type: value, refId: undefined } })} /></Col>
                  {node.assignee?.type === "USER" ? <Col xs={24} md={4}><Select showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="选择审批人" value={node.assignee.refId ?? undefined} options={designerOptions.users.map((user) => ({ value: user.id, label: `${user.displayName}（${user.username}）` }))} onChange={(refId) => updateNode(index, { assignee: { type: "USER", refId } })} /></Col> : null}
                  {node.assignee?.type === "ROLE" ? <Col xs={24} md={4}><Select showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="选择审批角色" value={node.assignee.refId ?? undefined} options={designerOptions.roles.map((role) => ({ value: role.code, label: `${role.name}（${role.code}）` }))} onChange={(refId) => updateNode(index, { assignee: { type: "ROLE", refId } })} /></Col> : null}
                  {node.assignee?.type === "POSITION" ? <Col xs={24} md={4}><Select showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="选择审批岗位" value={node.assignee.refId ?? undefined} options={designerOptions.positions.map((position) => ({ value: position.code, label: `${position.name}（${position.code}）` }))} onChange={(refId) => updateNode(index, { assignee: { type: "POSITION", refId } })} /></Col> : null}
                  <Col xs={12} md={3}><InputNumber style={{ width: "100%" }} min={1} max={8760} addonAfter="小时" value={node.timeoutHours ?? 24} onChange={(value) => updateNode(index, { timeoutHours: value })} /></Col>
                  <Col xs={12} md={2}><Space><Switch checked={node.allowReturn !== false} onChange={(checked) => updateNode(index, { allowReturn: checked })} /><Typography.Text>可退回</Typography.Text></Space></Col>
                  <Col flex="auto"><Space><Button title="上移" icon={<ArrowUpOutlined />} disabled={index <= 1} onClick={() => move(index, -1)}>上移</Button><Button title="下移" icon={<ArrowDownOutlined />} disabled={index >= definition.nodes.length - 2} onClick={() => move(index, 1)}>下移</Button><Button danger icon={<DeleteOutlined />} onClick={() => remove(index)}>删除</Button></Space></Col>
                  <Col span={24}>
                    <Space wrap align="center">
                      <Switch checked={Boolean(node.conditions?.length)} onChange={(checked) => toggleCondition(index, checked)} />
                      <Typography.Text strong>适用条件（可选）</Typography.Text>
                      <Typography.Text type="secondary">关闭表示所有申请都经过此环节</Typography.Text>
                    </Space>
                    {node.conditions?.length ? <Row gutter={[8, 8]} style={{ marginTop: 10 }}>
                      <Col xs={24} md={7}><Select style={{ width: "100%" }} value={node.conditions[0]?.field} options={conditionFieldOptions} onChange={(field) => updateCondition(index, { field })} /></Col>
                      <Col xs={24} md={7}><Select style={{ width: "100%" }} value={node.conditions[0]?.operator} options={conditionOperatorOptions} onChange={(operator: WorkflowCondition["operator"]) => updateCondition(index, { operator })} /></Col>
                      <Col xs={24} md={10}>{node.conditions[0]?.field === "amount"
                        ? <InputNumber style={{ width: "100%" }} min={0} precision={2} addonAfter="元" value={Number(node.conditions[0]?.value ?? 0)} onChange={(value) => updateCondition(index, { value: value ?? 0 })} />
                        : <Input value={String(node.conditions[0]?.value ?? "")} placeholder="请输入条件值" onChange={(event) => updateCondition(index, { value: event.target.value })} />}</Col>
                    </Row> : null}
                  </Col>
                </> : <Col><Typography.Text type="secondary">{node.type === "START" ? "申请人提交后自动进入第一审批环节" : "全部审批完成后自动结束"}</Typography.Text></Col>}
              </Row>
            </Card>)}
          </div>
          <Button block type="dashed" icon={<PlusOutlined />} onClick={addApproval}>添加审批环节</Button>
          <Divider orientation="left">流程测试</Divider>
          <Space wrap align="end">
            <div><Typography.Text type="secondary">测试金额</Typography.Text><br /><InputNumber style={{ width: 180 }} min={0} precision={2} addonAfter="元" value={simulationContext.amount} onChange={(amount) => setSimulationContext((current) => ({ ...current, amount: amount ?? 0 }))} /></div>
            <div><Typography.Text type="secondary">测试风险等级</Typography.Text><br /><Select style={{ width: 180 }} value={simulationContext.riskLevel} options={[{ value: "NORMAL", label: "普通权限" }, { value: "HIGH", label: "高权限" }]} onChange={(riskLevel) => setSimulationContext((current) => ({ ...current, riskLevel }))} /></div>
            <Button onClick={() => void simulate()}>预览流程</Button>
          </Space>
          <Divider />
          <Space wrap><Button icon={<SaveOutlined />} onClick={() => void save()} loading={saving}>保存草稿</Button><Button type="primary" onClick={publish} loading={saving}>发布流程</Button></Space>
          {simulation.length ? <Card size="small" title="流程预览" style={{ marginTop: 16 }}><Space wrap>{simulation.map((step, index) => <Space key={step.nodeKey}><Tag color={step.status === "ACTIVE" ? "blue" : step.status === "SKIPPED" ? "default" : "green"}>{index + 1}. {step.nodeName}</Tag>{index < simulation.length - 1 ? <Typography.Text type="secondary">→</Typography.Text> : null}</Space>)}</Space></Card> : null}
        </ContentCard>
      </Col>
    </Row>
  </>;
}
