import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useMemo, useState } from "react";
import { api } from "../../../api/services";
import type { ReimbursementLineInput } from "../../../api/types";
import { DateField, FormField, TextAreaField, TextField } from "../../../components/form";
import { AccessDenied, PageShell, SectionCard } from "../../../components/ui";
import { localDateString } from "../../../domain/format";
import { centsToYuan, canCreateReimbursement, yuanToCents } from "../../../domain/reimbursements";
import { useSession } from "../../../hooks/useSession";

type LineDraft = {
  key: string;
  expenseDate: string;
  category: string;
  description: string;
  payeeName: string;
  payeeAccount: string;
  payeeBank: string;
  paymentYuan: string;
  invoiceYuan: string;
};

function newLine(index: number): LineDraft {
  return {
    key: `${Date.now()}-${index}`,
    expenseDate: localDateString(),
    category: "",
    description: "",
    payeeName: "",
    payeeAccount: "",
    payeeBank: "",
    paymentYuan: "",
    invoiceYuan: ""
  };
}

function toInput(line: LineDraft, sequence: number): ReimbursementLineInput | null {
  const paymentCents = yuanToCents(line.paymentYuan);
  const invoiceCents = yuanToCents(line.invoiceYuan);
  if (!line.expenseDate || !line.category.trim() || !line.description.trim() || paymentCents === null || invoiceCents === null) {
    return null;
  }
  if (invoiceCents < paymentCents) return null;
  return {
    sequence,
    expenseDate: `${line.expenseDate}T00:00:00.000Z`,
    category: line.category.trim(),
    description: line.description.trim(),
    payeeName: line.payeeName.trim() || null,
    payeeAccount: line.payeeAccount.trim() || null,
    payeeBank: line.payeeBank.trim() || null,
    paymentCents,
    invoiceCents
  };
}

export default function ReimbursementFormPage() {
  const user = useSession();
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine(1)]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => lines.reduce(
    (sum, line) => ({
      payment: sum.payment + (yuanToCents(line.paymentYuan) ?? 0),
      invoice: sum.invoice + (yuanToCents(line.invoiceYuan) ?? 0)
    }),
    { payment: 0, invoice: 0 }
  ), [lines]);

  if (!user) return <PageShell title="发起报销" />;
  if (!canCreateReimbursement(user)) {
    return <AccessDenied message="只有绑定了内部员工岗位并获得员工自助权限的账号可以发起报销。" />;
  }

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  };

  const submit = async () => {
    if (!title.trim()) {
      await Taro.showToast({ title: "请填写报销标题", icon: "none" });
      return;
    }
    const inputs = lines.map((line, index) => toInput(line, index + 1));
    if (inputs.some((line) => line === null)) {
      await Taro.showToast({ title: "请完善明细，发票金额不能低于付款金额", icon: "none", duration: 2500 });
      return;
    }
    setSaving(true);
    try {
      const created = await api.createReimbursement({
        title: title.trim(),
        lines: inputs as ReimbursementLineInput[]
      });
      await Taro.showToast({ title: "草稿已创建", icon: "success" });
      await Taro.redirectTo({ url: `/pages/reimbursements/detail/index?id=${encodeURIComponent(created.id)}` });
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none", duration: 2500 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="发起报销" subtitle="申请人和组织归属由当前内部员工档案自动带入">
      <SectionCard title="报销信息">
        <FormField label="报销标题" required>
          <TextField value={title} placeholder="例如：7 月项目差旅报销" onChange={setTitle} maxlength={200} />
        </FormField>
      </SectionCard>

      {lines.map((line, index) => (
        <SectionCard
          key={line.key}
          title={`费用明细 ${index + 1}`}
          action={lines.length > 1 ? (
            <Text className="link-text" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>删除</Text>
          ) : null}
        >
          <FormField label="费用日期" required>
            <DateField value={line.expenseDate} onChange={(value) => updateLine(line.key, { expenseDate: value })} />
          </FormField>
          <FormField label="费用类型" required>
            <TextField value={line.category} placeholder="差旅费、办公费、招待费等" onChange={(value) => updateLine(line.key, { category: value })} maxlength={80} />
          </FormField>
          <FormField label="费用用途" required>
            <TextAreaField value={line.description} placeholder="说明费用发生事项和用途" onChange={(value) => updateLine(line.key, { description: value })} maxlength={500} />
          </FormField>
          <View className="reimbursement-amount-grid">
            <FormField label="付款金额（元）" required>
              <TextField value={line.paymentYuan} placeholder="0.00" type="digit" onChange={(value) => updateLine(line.key, { paymentYuan: value })} />
            </FormField>
            <FormField label="发票金额（元）" required hint="可以等于付款金额，不能低于付款金额">
              <TextField value={line.invoiceYuan} placeholder="0.00" type="digit" onChange={(value) => updateLine(line.key, { invoiceYuan: value })} />
            </FormField>
          </View>
          <FormField label="收款人">
            <TextField value={line.payeeName} placeholder="选填" onChange={(value) => updateLine(line.key, { payeeName: value })} />
          </FormField>
          <FormField label="收款账号">
            <TextField value={line.payeeAccount} placeholder="选填" onChange={(value) => updateLine(line.key, { payeeAccount: value })} />
          </FormField>
          <FormField label="开户行">
            <TextField value={line.payeeBank} placeholder="选填" onChange={(value) => updateLine(line.key, { payeeBank: value })} maxlength={200} />
          </FormField>
        </SectionCard>
      ))}

      <Button className="button button--ghost" onClick={() => setLines((current) => [...current, newLine(current.length + 1)])}>
        + 新增费用明细
      </Button>
      <SectionCard title="金额汇总">
        <View className="reimbursement-summary-row"><Text>付款合计</Text><Text>¥{centsToYuan(totals.payment)}</Text></View>
        <View className="reimbursement-summary-row"><Text>发票合计</Text><Text>¥{centsToYuan(totals.invoice)}</Text></View>
        <View className="reimbursement-summary-row"><Text>票据覆盖差额</Text><Text>¥{centsToYuan(Math.max(0, totals.invoice - totals.payment))}</Text></View>
      </SectionCard>
      <Button className="button" loading={saving} disabled={saving} onClick={() => void submit()}>
        保存草稿并上传材料
      </Button>
      <Text className="muted reimbursement-bottom-tip">草稿创建后，在详情页按每条明细分别上传付款凭证和发票。</Text>
    </PageShell>
  );
}
