import { useMemo, useState } from "react";
import { CloudUploadOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, DatePicker, Form, Input, Modal, Select, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Permission } from "@xiangneng/shared";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage } from "../lib/api";
import { listResult, formatDate, formatDateTime, projectName } from "../lib/format";
import type { ContractTemplate, ElectronicContract, ElectronicSeal, ListResult, Person } from "../types/domain";

type TemplateValues = { name: string; contractType: string; originalName: string; version: string };
type SealValues = { name: string; originalName: string };
type ContractValues = { personId: string; templateId: string; sealId?: string; dueDate?: Dayjs };

const contractStatusLabels: Record<ElectronicContract["status"], string> = {
  PENDING_UPLOAD: "待上传资料",
  READY_TO_SIGN: "待签署",
  SIGNED: "已签署",
  ARCHIVED: "已归档",
  CANCELLED: "已取消"
};

function contractStatusTag(status: ElectronicContract["status"]) {
  const color = status === "SIGNED" || status === "ARCHIVED" ? "green" : status === "READY_TO_SIGN" ? "blue" : status === "CANCELLED" ? "red" : "orange";
  return <Tag color={color}>{contractStatusLabels[status] ?? status}</Tag>;
}

function ElectronicContractsContent() {
  const { message } = App.useApp();
  const [contractPage, setContractPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<ElectronicContract["status"]>();
  const [keyword, setKeyword] = useState("");
  const [personKeyword, setPersonKeyword] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sealOpen, setSealOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [templateForm] = Form.useForm<TemplateValues>();
  const [sealForm] = Form.useForm<SealValues>();
  const [contractForm] = Form.useForm<ContractValues>();

  const templatesResource = useApiResource(() => api.get<ListResult<ContractTemplate> | ContractTemplate[]>("/contract-templates", { page: 1, pageSize: 100 }), []);
  const sealsResource = useApiResource(() => api.get<ListResult<ElectronicSeal> | ElectronicSeal[]>("/electronic-seals", { page: 1, pageSize: 100 }), []);
  const peopleResource = useApiResource(
    () => api.get<ListResult<Person> | Person[]>("/people", { page: 1, pageSize: 50, keyword: personKeyword }),
    [personKeyword]
  );
  const contractsResource = useApiResource(
    () => api.get<ListResult<ElectronicContract> | ElectronicContract[]>("/electronic-contracts", { page: contractPage, pageSize, status, keyword }),
    [contractPage, pageSize, status, keyword]
  );

  const templates = templatesResource.data ? listResult(templatesResource.data, 1, 100).items : [];
  const seals = sealsResource.data ? listResult(sealsResource.data, 1, 100).items : [];
  const people = peopleResource.data ? listResult(peopleResource.data, 1, 50).items : [];
  const contracts = contractsResource.data ? listResult(contractsResource.data, contractPage, pageSize) : undefined;
  const activeTemplates = templates.filter((item) => item.isActive);
  const activeSeals = seals.filter((item) => item.status === "ACTIVE");
  const personOptions = useMemo(() => people.map((person) => ({ value: person.id, label: `${person.name}｜${projectName(person)}｜${person.phone}`, searchText: `${person.name} ${person.phone} ${person.idCard} ${projectName(person)}` })), [people]);

  const createTemplate = async (values: TemplateValues) => {
    setSubmitting(true);
    try {
      await api.post<ContractTemplate>("/contract-templates", values);
      message.success("合同模板已上传");
      setTemplateOpen(false);
      templateForm.resetFields();
      await templatesResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const createSeal = async (values: SealValues) => {
    setSubmitting(true);
    try {
      await api.post<ElectronicSeal>("/electronic-seals", values);
      message.success("电子公章已上传");
      setSealOpen(false);
      sealForm.resetFields();
      await sealsResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const createContract = async (values: ContractValues) => {
    setSubmitting(true);
    try {
      await api.post<ElectronicContract>("/electronic-contracts", { ...values, dueDate: values.dueDate?.format("YYYY-MM-DD") });
      message.success("电子合同已生成，员工可在小程序上传签署资料");
      setContractOpen(false);
      contractForm.resetFields();
      await contractsResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const signContract = async (contract: ElectronicContract) => {
    setSubmitting(true);
    try {
      const materialName = contract.materialNames.length ? undefined : "后台补充签署资料";
      if (materialName) await api.post(`/electronic-contracts/${contract.id}/materials`, { materialName });
      await api.post<ElectronicContract>(`/electronic-contracts/${contract.id}/sign`, {});
      message.success("合同已签署，并自动归档到员工附件");
      await contractsResource.reload();
      await peopleResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const templateColumns: TableColumnsType<ContractTemplate> = [
    { title: "模板名称", dataIndex: "name", width: 180 },
    { title: "合同类型", dataIndex: "contractType", width: 120 },
    { title: "文件名", dataIndex: "originalName", width: 220 },
    { title: "版本", dataIndex: "version", width: 90 },
    { title: "状态", width: 90, render: (_, row) => <Tag color={row.isActive ? "green" : "default"}>{row.isActive ? "启用" : "停用"}</Tag> },
    { title: "上传时间", dataIndex: "createdAt", width: 170, render: (value) => formatDateTime(value) }
  ];

  const sealColumns: TableColumnsType<ElectronicSeal> = [
    { title: "公章名称", dataIndex: "name", width: 180 },
    { title: "文件名", dataIndex: "originalName", width: 220 },
    { title: "状态", width: 90, render: (_, row) => <Tag color={row.status === "ACTIVE" ? "green" : "default"}>{row.status === "ACTIVE" ? "启用" : "停用"}</Tag> },
    { title: "上传时间", dataIndex: "createdAt", width: 170, render: (value) => formatDateTime(value) }
  ];

  const contractColumns: TableColumnsType<ElectronicContract> = [
    { title: "合同编号", dataIndex: "contractNo", fixed: "left", width: 170 },
    { title: "员工", dataIndex: "personName", width: 110 },
    { title: "项目", width: 190, render: (_, row) => row.person ? projectName(row.person) : "—" },
    { title: "模板", dataIndex: "templateName", width: 180 },
    { title: "电子公章", dataIndex: "sealName", width: 160, render: (value: string | null) => value || "—" },
    { title: "资料", width: 180, render: (_, row) => row.materialNames.length ? row.materialNames.join("、") : "待员工上传" },
    { title: "截止日期", dataIndex: "dueDate", width: 120, render: (value) => formatDate(value) },
    { title: "状态", width: 110, render: (_, row) => contractStatusTag(row.status) },
    { title: "签署时间", dataIndex: "signedAt", width: 170, render: (value) => formatDateTime(value) },
    { title: "归档文件", dataIndex: "signedFileName", width: 220, render: (value: string | null) => value || "—" },
    {
      title: "操作",
      fixed: "right",
      width: 110,
      render: (_, row) => row.status === "SIGNED" || row.status === "ARCHIVED"
        ? <Typography.Text type="secondary">已归档</Typography.Text>
        : <Button type="link" size="small" loading={submitting} onClick={() => void signContract(row)}>演示签署</Button>
    }
  ];

  return (
    <>
      <PageHeader
        title="电子合同管理"
        description="上传合同模板和电子公章，生成员工电子合同；员工签署完成后自动归档到人员附件。"
        extra={<><Button icon={<CloudUploadOutlined />} onClick={() => setTemplateOpen(true)}>上传合同模板</Button><Button icon={<CloudUploadOutlined />} onClick={() => setSealOpen(true)}>上传电子公章</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { setPersonKeyword(""); setContractOpen(true); }}>生成合同</Button></>}
      />
      <ContentCard>
        <Tabs
          items={[
            {
              key: "contracts",
              label: "合同记录",
              children: (
                <>
                  <div className="filter-grid compact">
                    <Input allowClear placeholder="员工 / 合同编号 / 模板" value={keyword} onChange={(event) => { setKeyword(event.target.value); setContractPage(1); }} />
                    <Select allowClear placeholder="签署状态" value={status} options={Object.entries(contractStatusLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setContractPage(1); }} />
                  </div>
                  {contractsResource.error && !contracts ? <ErrorBlock error={contractsResource.error} onRetry={() => void contractsResource.reload()} /> : (
                    <Table<ElectronicContract>
                      rowKey="id"
                      columns={contractColumns}
                      dataSource={contracts?.items ?? []}
                      loading={contractsResource.loading}
                      scroll={{ x: 1700 }}
                      pagination={{ current: contractPage, pageSize, total: contracts?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 份合同` }}
                      onChange={(pagination) => { setContractPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
                      locale={{ emptyText: "暂无电子合同" }}
                    />
                  )}
                </>
              )
            },
            { key: "templates", label: "合同模板", children: <Table<ContractTemplate> rowKey="id" columns={templateColumns} dataSource={templates} loading={templatesResource.loading} pagination={false} scroll={{ x: 980 }} locale={{ emptyText: "暂无合同模板" }} /> },
            { key: "seals", label: "电子公章", children: <Table<ElectronicSeal> rowKey="id" columns={sealColumns} dataSource={seals} loading={sealsResource.loading} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: "暂无电子公章" }} /> }
          ]}
        />
      </ContentCard>

      <Modal title="上传合同模板" open={templateOpen} confirmLoading={submitting} onCancel={() => setTemplateOpen(false)} onOk={() => templateForm.submit()} destroyOnHidden>
        <Form<TemplateValues> form={templateForm} layout="vertical" onFinish={(values) => void createTemplate(values)} initialValues={{ contractType: "劳动合同", version: "V1.0" }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请输入模板名称" }]}><Input maxLength={120} /></Form.Item>
          <Form.Item name="contractType" label="合同类型" rules={[{ required: true, message: "请输入合同类型" }]}><Input maxLength={64} /></Form.Item>
          <Form.Item name="originalName" label="模板文件名" rules={[{ required: true, message: "请输入模板文件名" }]}><Input placeholder="如：劳动合同模板.docx" maxLength={255} /></Form.Item>
          <Form.Item name="version" label="版本" rules={[{ required: true, message: "请输入版本" }]}><Input maxLength={32} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="上传电子公章" open={sealOpen} confirmLoading={submitting} onCancel={() => setSealOpen(false)} onOk={() => sealForm.submit()} destroyOnHidden>
        <Form<SealValues> form={sealForm} layout="vertical" onFinish={(values) => void createSeal(values)}>
          <Form.Item name="name" label="公章名称" rules={[{ required: true, message: "请输入公章名称" }]}><Input maxLength={120} /></Form.Item>
          <Form.Item name="originalName" label="公章文件名" rules={[{ required: true, message: "请输入公章文件名" }]}><Input placeholder="如：电子公章.png" maxLength={255} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="生成员工电子合同" open={contractOpen} confirmLoading={submitting} onCancel={() => setContractOpen(false)} onOk={() => contractForm.submit()} destroyOnHidden>
        <Form<ContractValues> form={contractForm} layout="vertical" onFinish={(values) => void createContract(values)}>
          <Form.Item name="personId" label="员工" rules={[{ required: true, message: "请选择员工" }]}><ReferenceSelect options={personOptions} loading={peopleResource.loading} filterOption={false} onSearch={setPersonKeyword} notFoundContent={peopleResource.loading ? "正在查询" : "未找到人员"} /></Form.Item>
          <Form.Item name="templateId" label="合同模板" rules={[{ required: true, message: "请选择合同模板" }]}><Select options={activeTemplates.map((item) => ({ value: item.id, label: `${item.name}（${item.version}）` }))} /></Form.Item>
          <Form.Item name="sealId" label="电子公章"><Select allowClear options={activeSeals.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item name="dueDate" label="签署截止日期"><DatePicker className="full-width" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ElectronicContractsPage() {
  return <PermissionGuard permission={Permission.CONTRACT_MANAGE}><ElectronicContractsContent /></PermissionGuard>;
}
