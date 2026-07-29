import { Space, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { DepartmentReimbursementSummary } from "../types/domain";
import { formatDate } from "../lib/format";

function currency(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(cents / 100);
}

export function ReimbursementDepartmentSummaryDetails({
  summary
}: {
  summary: DepartmentReimbursementSummary;
}) {
  const categoryColumns: TableColumnsType<DepartmentReimbursementSummary["categorySummaries"][number]> = [
    { title: "费用类型", dataIndex: "category" },
    { title: "明细数", dataIndex: "lineCount", width: 100, render: (value: number) => `${value} 笔` },
    { title: "付款金额", dataIndex: "totalPaymentCents", width: 150, render: currency },
    { title: "发票金额", dataIndex: "totalInvoiceCents", width: 150, render: currency }
  ];
  const applicantColumns: TableColumnsType<DepartmentReimbursementSummary["applicantSummaries"][number]> = [
    { title: "报销人", dataIndex: "applicantName" },
    { title: "报销单", dataIndex: "batchCount", width: 100, render: (value: number) => `${value} 张` },
    { title: "申报金额", dataIndex: "totalPaymentCents", width: 150, render: currency },
    {
      title: "审核通过金额",
      dataIndex: "totalApprovedAmountCents",
      width: 160,
      render: (value: number) => value > 0 ? currency(value) : "待财务审核"
    },
    { title: "发票金额", dataIndex: "totalInvoiceCents", width: 150, render: currency }
  ];
  const detailColumns: TableColumnsType<DepartmentReimbursementSummary["detailRows"][number]> = [
    { title: "报销编号", dataIndex: "code", width: 150 },
    { title: "报销人", dataIndex: "applicantName", width: 100 },
    { title: "费用日期", dataIndex: "expenseDate", width: 120, render: (value: string | null) => value ? formatDate(value) : "—" },
    { title: "费用类型", dataIndex: "category", width: 120 },
    { title: "费用用途", dataIndex: "description", width: 260 },
    { title: "付款金额", dataIndex: "paymentCents", width: 140, render: currency },
    { title: "发票金额", dataIndex: "invoiceCents", width: 140, render: currency }
  ];

  return (
    <Space orientation="vertical" size={18} style={{ width: "100%" }}>
      <section>
        <Typography.Title level={5}>表1：按费用类型汇总</Typography.Title>
        <Table
          rowKey="category"
          size="small"
          columns={categoryColumns}
          dataSource={summary.categorySummaries}
          pagination={false}
        />
      </section>
      <section>
        <Typography.Title level={5}>表2：按报销人汇总</Typography.Title>
        <Table
          rowKey="applicantUserId"
          size="small"
          columns={applicantColumns}
          dataSource={summary.applicantSummaries}
          pagination={false}
        />
      </section>
      <section>
        <Typography.Title level={5}>表3：费用明细汇总</Typography.Title>
        <Table
          rowKey="lineId"
          size="small"
          columns={detailColumns}
          dataSource={summary.detailRows}
          pagination={false}
          scroll={{ x: 1030 }}
        />
      </section>
    </Space>
  );
}
