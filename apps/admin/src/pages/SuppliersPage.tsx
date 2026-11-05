import { useState } from "react";
import { EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { Permission } from "@xiangneng/shared";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage } from "../lib/api";
import { adaptSupplier, mapList } from "../lib/adapters";
import { displayText, listResult } from "../lib/format";
import type { ListResult, Supplier } from "../types/domain";

type SupplierFormValues = {
  name: string;
  contactName?: string;
  contactPhone?: string;
  level?: string;
};

function supplierToForm(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    contactName: supplier.contactName ?? undefined,
    contactPhone: supplier.contactPhone ?? undefined,
    level: supplier.level ?? undefined
  };
}

function SuppliersContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm<SupplierFormValues>();
  const [detailForm] = Form.useForm<SupplierFormValues>();
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Supplier>();
  const [detailLoading, setDetailLoading] = useState(false);

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<Supplier> | Supplier[]>("/suppliers", { page, pageSize, keyword, level }), adaptSupplier, page, pageSize),
    [page, pageSize, keyword, level]
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const levels = [...new Set((list?.items ?? []).map((supplier) => supplier.level).filter((value): value is string => Boolean(value)))];

  const openCreate = () => {
    createForm.resetFields();
    setFormOpen(true);
  };

  const saveSupplier = async (values: SupplierFormValues) => {
    setSaving(true);
    try {
      await api.post("/suppliers", values);
      message.success("供应商已创建");
      setFormOpen(false);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (supplier: Supplier) => {
    setDetail(supplier);
    detailForm.setFieldsValue(supplierToForm(supplier));
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const loaded = adaptSupplier(await api.get<Supplier>(`/suppliers/${supplier.id}`));
      setDetail(loaded);
      detailForm.setFieldsValue(supplierToForm(loaded));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveSupplierDetail = async (values: SupplierFormValues) => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = adaptSupplier(await api.patch<Supplier>(`/suppliers/${detail.id}`, values));
      setDetail(updated);
      detailForm.setFieldsValue(supplierToForm(updated));
      message.success("供应商资料已保存");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<Supplier> = [
    { title: "供应商名称", dataIndex: "name", fixed: "left", width: 240 },
    { title: "联系人", dataIndex: "contactName", width: 120, render: (value: string | null) => displayText(value) },
    { title: "联系方式", dataIndex: "contactPhone", width: 140, render: (value: string | null) => displayText(value) },
    { title: "供应商级别", dataIndex: "level", width: 120, render: (value: string | null) => value ? <Tag color="cyan">{value}</Tag> : <Tag>未评级</Tag> },
    { title: "报名人数", dataIndex: "applicationCount", width: 100, render: (value: number | undefined) => value ?? 0 },
    { title: "已入职", dataIndex: "onboardCount", width: 90, render: (value: number | undefined) => value ?? 0 },
    { title: "当前在职", dataIndex: "activeCount", width: 100, render: (value: number | undefined) => value ?? 0 },
    {
      title: "操作",
      fixed: "right",
      width: 100,
      render: (_, row) => <Button type="link" size="small" icon={can(Permission.SUPPLIER_WRITE) ? <EditOutlined /> : <EyeOutlined />} onClick={() => void openDetail(row)}>{can(Permission.SUPPLIER_WRITE) ? "编辑" : "查看"}</Button>
    }
  ];

  return (
    <>
      <PageHeader
        title="供应商管理"
        description="供应商名称唯一，人员数据和适用政策均按供应商身份隔离。"
        extra={can(Permission.SUPPLIER_WRITE) ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建供应商</Button> : null}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="供应商名称 / 联系人" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => setPage(1)} />
          <ReferenceSelect placeholder="供应商级别" options={levels.map((value) => ({ value, label: value }))} value={level} onChange={(value) => { setLevel(value as string | undefined); setPage(1); }} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<Supplier>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1080 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 家供应商` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无供应商数据" }}
          />
        )}
      </ContentCard>

      <Modal title="新建供应商" open={formOpen} confirmLoading={saving} onCancel={() => setFormOpen(false)} onOk={() => createForm.submit()} destroyOnHidden>
        <Form<SupplierFormValues> form={createForm} layout="vertical" onFinish={(values) => void saveSupplier(values)}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]}><Input maxLength={200} /></Form.Item>
          <div className="form-grid two-columns">
            <Form.Item name="contactName" label="联系人"><Input maxLength={64} placeholder="缺失时留空" /></Form.Item>
            <Form.Item name="contactPhone" label="联系方式"><Input maxLength={32} placeholder="缺失时留空" /></Form.Item>
            <Form.Item name="level" label="供应商级别"><Input maxLength={32} placeholder="按实际政策维护" /></Form.Item>
          </div>
        </Form>
      </Modal>

      <Drawer title="供应商详情与编辑" width={820} open={detailOpen} loading={detailLoading} onClose={() => setDetailOpen(false)} extra={detail && can(Permission.SUPPLIER_WRITE) ? <Button type="primary" loading={saving} onClick={() => detailForm.submit()}>保存修改</Button> : null}>
        {detail ? (
          <>
            <Row gutter={[12, 12]} className="detail-stats">
              {[
                ["报名人数", detail.applicationCount ?? 0],
                ["已到场", detail.arrivedCount ?? 0],
                ["面试通过", detail.passedCount ?? 0],
                ["已入职", detail.onboardCount ?? 0],
                ["当前在职", detail.activeCount ?? 0],
                ["已离职", detail.offboardCount ?? 0]
              ].map(([label, value]) => (
                <Col xs={12} md={8} key={String(label)}><Card hoverable onClick={() => navigate(`/people?supplierId=${detail.id}`)}><Statistic title={label} value={Number(value)} /></Card></Col>
              ))}
            </Row>
            <Typography.Title level={4} className="section-title">供应商资料</Typography.Title>
            <Form<SupplierFormValues> form={detailForm} layout="vertical" disabled={!can(Permission.SUPPLIER_WRITE)} onFinish={(values) => void saveSupplierDetail(values)}>
              <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]}><Input maxLength={200} /></Form.Item>
              <div className="form-grid two-columns">
                <Form.Item name="contactName" label="联系人"><Input maxLength={64} placeholder="请输入联系人姓名" /></Form.Item>
                <Form.Item name="contactPhone" label="联系方式"><Input maxLength={32} placeholder="请输入完整联系电话" /></Form.Item>
                <Form.Item name="level" label="供应商级别"><Input maxLength={32} placeholder="按实际政策维护" /></Form.Item>
              </div>
            </Form>
            <div className="section-title-row">
              <Typography.Title level={4}>供应商数据范围</Typography.Title>
              <Button onClick={() => navigate(`/people?supplierId=${detail.id}`)}>查看人员名单</Button>
            </div>
            <Typography.Paragraph type="secondary">
              供应商账号仅能查看本供应商报送的人员、关联招聘需求和适用政策，不能访问其他供应商数据。
            </Typography.Paragraph>
          </>
        ) : null}
      </Drawer>
    </>
  );
}

export function SuppliersPage() {
  return <PermissionGuard permission={Permission.SUPPLIER_READ}><SuppliersContent /></PermissionGuard>;
}
