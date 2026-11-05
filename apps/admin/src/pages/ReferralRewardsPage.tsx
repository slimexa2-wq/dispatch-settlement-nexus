import { useState } from "react";
import { CheckCircleOutlined, DollarOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag
} from "antd";
import type { TableColumnsType } from "antd";
import { Permission, RewardStatus } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage } from "../lib/api";
import { adaptReward, mapList } from "../lib/adapters";
import { formatDate, formatMoney, listResult, projectName } from "../lib/format";
import type { ListResult, ReferralReward } from "../types/domain";

const rewardLabels: Record<RewardStatus, string> = {
  [RewardStatus.PENDING]: "待达成",
  [RewardStatus.ACHIEVED]: "已达成",
  [RewardStatus.PAID]: "已发放",
  [RewardStatus.CANCELLED]: "已取消"
};

type ReviewValues = { status: RewardStatus; notes?: string };

function ReferralRewardsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<RewardStatus>();
  const [reviewing, setReviewing] = useState<ReferralReward>();
  const [form] = Form.useForm<ReviewValues>();
  const [saving, setSaving] = useState(false);

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<ReferralReward> | ReferralReward[]>("/referral-rewards", { page, pageSize, status }), adaptReward, page, pageSize),
    [page, pageSize, status]
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;

  const openReview = (reward: ReferralReward, nextStatus?: RewardStatus) => {
    setReviewing(reward);
    form.setFieldsValue({ status: nextStatus ?? reward.status, notes: reward.notes ?? undefined });
  };

  const submitReview = async (values: ReviewValues) => {
    if (!reviewing) return;
    setSaving(true);
    try {
      await api.patch(`/referral-rewards/${reviewing.id}`, values);
      message.success("奖励状态已更新");
      setReviewing(undefined);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<ReferralReward> = [
    { title: "被推荐人", width: 110, render: (_, row) => row.person?.name ?? "—" },
    { title: "手机号", width: 130, render: (_, row) => row.person?.phone ?? "—" },
    { title: "项目", width: 180, render: (_, row) => row.person ? projectName(row.person) : "—" },
    { title: "推荐人", width: 130, render: (_, row) => row.recommender?.displayName || row.recommender?.username || "—" },
    { title: "绑定政策", width: 210, render: (_, row) => row.policy?.name ?? "—" },
    { title: "奖励金额", dataIndex: "amount", width: 130, render: formatMoney },
    { title: "人员状态", width: 110, render: (_, row) => <StatusTag status={row.person?.employmentStatus ?? row.person?.status} /> },
    { title: "入职日期", width: 110, render: (_, row) => formatDate(row.person?.onboardDate) },
    { title: "奖励状态", dataIndex: "status", width: 110, render: (value: RewardStatus) => <StatusTag status={value} /> },
    { title: "备注", dataIndex: "notes", width: 180, ellipsis: { showTitle: true }, render: (value: string | null) => value || "—" },
    {
      title: "操作",
      fixed: "right",
      width: 210,
      render: (_, row) => can(Permission.REWARD_REVIEW) ? (
        <Space size={4}>
          {row.status === RewardStatus.PENDING ? <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => openReview(row, RewardStatus.ACHIEVED)}>标记达成</Button> : null}
          {row.status === RewardStatus.ACHIEVED ? <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => openReview(row, RewardStatus.PAID)}>确认发放</Button> : null}
          <Button type="link" size="small" onClick={() => openReview(row)}>审核</Button>
        </Space>
      ) : <Tag>只读</Tag>
    }
  ];

  return (
    <>
      <PageHeader title="推荐奖励审核" description="奖励金额来自人员报名时绑定的内部推荐政策版本，不在审核环节临时填写。" />
      <ContentCard>
        <div className="filter-grid compact">
          <Select allowClear placeholder="奖励状态" value={status} options={Object.entries(rewardLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<ReferralReward>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1500 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条奖励记录` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无推荐奖励记录" }}
          />
        )}
      </ContentCard>

      <Modal title="奖励审核" open={Boolean(reviewing)} confirmLoading={saving} onCancel={() => setReviewing(undefined)} onOk={() => form.submit()} destroyOnHidden>
        <Form<ReviewValues> form={form} layout="vertical" onFinish={(values) => void submitReview(values)}>
          <Form.Item label="被推荐人"><Input value={reviewing?.person?.name ?? "—"} disabled /></Form.Item>
          <Form.Item label="绑定政策"><Input value={reviewing?.policy?.name ?? "—"} disabled /></Form.Item>
          <Form.Item label="奖励金额"><Input value={formatMoney(reviewing?.amount)} disabled /></Form.Item>
          <Form.Item name="status" label="奖励状态" rules={[{ required: true, message: "请选择奖励状态" }]}><Select options={Object.entries(rewardLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="notes" label="审核备注"><Input.TextArea rows={4} maxLength={1000} showCount /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ReferralRewardsPage() {
  return <PermissionGuard permission={Permission.REWARD_REVIEW}><ReferralRewardsContent /></PermissionGuard>;
}
