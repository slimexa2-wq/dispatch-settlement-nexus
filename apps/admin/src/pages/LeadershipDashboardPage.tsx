import {
  AccountBookOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  BankOutlined,
  RiseOutlined,
  TeamOutlined,
  UsergroupAddOutlined
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Typography
} from "antd";
import { Link } from "react-router-dom";
import { ErrorBlock, LoadingBlock } from "../components/AsyncState";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type {
  LeadershipDashboard,
  ReimbursementStatus
} from "../types/domain";

const statusLabels: Record<ReimbursementStatus, string> = {
  PENDING_SUBMISSION: "待提交",
  DEPARTMENT_PREPARING: "部门制单中",
  OWNER_REVIEWING: "负责人审核中",
  FINANCE_REVIEWING: "财务审核中",
  APPROVED: "审核通过",
  PENDING_PAYMENT: "待打款",
  PAID: "已打款"
};

function currency(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function LeadershipDashboardPage() {
  const resource = useApiResource(
    () => api.get<LeadershipDashboard>("/leadership/dashboard"),
    []
  );
  const data = resource.data;

  if (resource.loading && !data) return <LoadingBlock rows={12} />;
  if (resource.error) {
    return <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} />;
  }
  if (!data) return null;

  const reimbursementCompletion = data.reimbursements.count
    ? Math.round((data.reimbursements.paidCount / data.reimbursements.count) * 100)
    : 0;

  return (
    <div className="page-stack leadership-dashboard-page">
      <PageHeader
        title="领导驾驶舱"
        description={`${data.period.label} · 统一读取人员、项目、招聘、供应商和报销正式业务数据`}
        extra={
          <Space>
            <Tag color="blue">更新时间 {formatDateTime(data.asOf)}</Tag>
            <Button onClick={() => void resource.reload()}>刷新数据</Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="leadership-kpi-card">
            <Statistic
              title="当前在职总人数"
              value={data.people.totalActive}
              prefix={<TeamOutlined />}
              suffix="人"
            />
            <Typography.Text type="secondary">
              外包 {data.people.outsourcedActive} · 内部 {data.people.internalActive}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="leadership-kpi-card">
            <Statistic
              title="本月人员净增"
              value={data.people.netGrowth}
              prefix={<RiseOutlined />}
              suffix="人"
              styles={{ content: { color: data.people.netGrowth >= 0 ? "#16a34a" : "#dc2626" } }}
            />
            <Typography.Text type="secondary">
              净增 {data.people.netGrowth >= 0 ? "+" : ""}{data.people.netGrowth} 人
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="leadership-kpi-card">
            <Statistic
              title="在营项目"
              value={data.projects.active}
              prefix={<ApartmentOutlined />}
              suffix="个"
            />
            <Typography.Text type="secondary">
              活跃供应商 {data.projects.activeSuppliers} 家
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="leadership-kpi-card">
            <Statistic
              title="报销付款总额"
              value={data.reimbursements.totalPaymentCents / 100}
              prefix={<AccountBookOutlined />}
              precision={2}
              suffix="元"
            />
            <Typography.Text type="secondary">
              报销待处理 {data.reimbursements.pendingCount} 单
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ContentCard
            title={<Space><UsergroupAddOutlined />招聘进度总览</Space>}
            extra={<Link to="/recruitment/demands">查看招聘需求 <ArrowRightOutlined /></Link>}
          >
            <Row gutter={[12, 12]}>
              <Col span={8}><Statistic title="招聘中需求" value={data.recruitment.activeDemands} suffix="个" /></Col>
              <Col span={8}><Statistic title="需求人数" value={data.recruitment.requiredCount} suffix="人" /></Col>
              <Col span={8}><Statistic title="已报名" value={data.recruitment.applicationCount} suffix="人" /></Col>
            </Row>
            <Progress
              percent={data.recruitment.completionRate}
              strokeColor={{ "0%": "#1d4ed8", "100%": "#22c55e" }}
            />
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Typography.Text strong>招聘缺口 {data.recruitment.remainingCount} 人</Typography.Text>
              <Typography.Text type="secondary">
                口径：招聘中岗位报名人数 / 需求人数
              </Typography.Text>
            </Space>
          </ContentCard>
        </Col>
        <Col xs={24} xl={12}>
          <ContentCard
            title={<Space><AccountBookOutlined />报销闭环总览</Space>}
            extra={<Link to="/reimbursements">查看报销闭环</Link>}
          >
            <Row gutter={[12, 12]}>
              <Col span={8}><Statistic title="报销单" value={data.reimbursements.count} suffix="单" /></Col>
              <Col span={8}><Statistic title="已打款" value={data.reimbursements.paidCount} suffix="单" /></Col>
              <Col span={8}><Statistic title="未解决问题" value={data.reimbursements.openIssues} suffix="项" /></Col>
            </Row>
            <Progress percent={reimbursementCompletion} status={data.reimbursements.openIssues ? "exception" : "success"} />
            <Space wrap>
              {data.reimbursements.byStatus.map((item) => (
                <Tag key={item.status} color={item.status === "PAID" ? "green" : "blue"}>
                  {statusLabels[item.status]} {item.count} 单 · {currency(item.paymentCents)}
                </Tag>
              ))}
            </Space>
          </ContentCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <ContentCard title={<Space><TeamOutlined />人员流动</Space>}>
            <div className="leadership-metric-list">
              {[
                { label: "本月入职", value: data.people.onboardMonth, color: "green" },
                { label: "本月离职", value: data.people.offboardMonth, color: "orange" },
                { label: "人员净增减", value: data.people.netGrowth, color: data.people.netGrowth >= 0 ? "blue" : "red" }
              ].map((item) => (
                <div className="leadership-metric-row" key={item.label}>
                  <Typography.Text>{item.label}</Typography.Text>
                  <Tag color={item.color}>{item.value >= 0 && item.label === "人员净增减" ? "+" : ""}{item.value} 人</Tag>
                </div>
              ))}
            </div>
            <Link to="/people">下钻外包人员明细</Link>
            <span> · </span>
            <Link to="/internal-employees">下钻内部员工明细</Link>
          </ContentCard>
        </Col>
        <Col xs={24} lg={8}>
          <ContentCard title={<Space><BankOutlined />票款口径</Space>}>
            <div className="leadership-metric-list">
              {[
                { label: "付款金额", value: currency(data.reimbursements.totalPaymentCents) },
                { label: "发票金额", value: currency(data.reimbursements.totalInvoiceCents) },
                { label: "发票高于付款", value: currency(data.reimbursements.invoiceExcessCents) }
              ].map((item) => (
                <div className="leadership-metric-row" key={item.label}>
                  <Typography.Text>{item.label}</Typography.Text>
                  <Typography.Text strong>{item.value}</Typography.Text>
                </div>
              ))}
            </div>
          </ContentCard>
        </Col>
        <Col xs={24} lg={8}>
          <ContentCard title={<Space><AuditOutlined />统计口径说明</Space>}>
            <div className="leadership-definition-list">
              {data.definitions.map((item) => <div key={item}>{item}</div>)}
            </div>
          </ContentCard>
        </Col>
      </Row>
    </div>
  );
}
