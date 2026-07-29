import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/services";
import type { ReimbursementAttachment, ReimbursementLine } from "../../../api/types";
import { DateField, FormField, SelectField, TextAreaField, TextField } from "../../../components/form";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, localDateString } from "../../../domain/format";
import {
  canManageIssues,
  centsToYuan,
  editableReimbursement,
  reimbursementAction,
  reimbursementPermissions,
  reimbursementStatusLabel
} from "../../../domain/reimbursements";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

const attachmentLabels: Record<ReimbursementAttachment["type"], string> = {
  PAYMENT_VOUCHER: "付款凭证",
  INVOICE: "发票",
  SUPPORTING: "辅助材料"
};

const issueTypes = [
  { label: "材料缺失", value: "材料缺失" },
  { label: "金额不一致", value: "金额不一致" },
  { label: "费用说明不清", value: "费用说明不清" },
  { label: "其他问题", value: "其他问题" }
];

export default function ReimbursementDetailPage() {
  const user = useSession();
  const id = Taro.getCurrentInstance().router?.params.id ?? "";
  const batch = useAsyncData(() => id ? api.reimbursement(id) : Promise.reject(new Error("缺少报销单 ID")), [id]);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [issueType, setIssueType] = useState(issueTypes[0]?.value ?? "材料缺失");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueLineId, setIssueLineId] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateString());
  const [paymentProofId, setPaymentProofId] = useState<string | null>(null);

  useEffect(() => {
    if (batch.data?.payment?.reference) setPaymentReference(batch.data.payment.reference);
    const existingProof = batch.data?.attachments.find(
      (attachment) => attachment.type === "PAYMENT_VOUCHER" && !attachment.lineId
    );
    if (existingProof) setPaymentProofId(existingProof.id);
  }, [batch.data?.attachments, batch.data?.payment?.reference]);

  const openIssues = useMemo(
    () => batch.data?.issues.filter((issue) => issue.status === "OPEN") ?? [],
    [batch.data?.issues]
  );

  if (!user) return <PageShell title="报销详情" />;
  if (!user.permissions.some((permission) => permission.startsWith("reimbursement:"))) {
    return <AccessDenied message="当前岗位没有报销查看或办理权限。" />;
  }

  const data = batch.data;
  const editable = data ? editableReimbursement(user, data) : false;
  const action = data ? reimbursementAction(user, data) : null;
  const issueAllowed = canManageIssues(user);
  const supplementAllowed = Boolean(
    data &&
    data.applicantUserId === user.id &&
    user.permissions.includes(reimbursementPermissions.self) &&
    openIssues.length > 0 &&
    (data.status === "OWNER_REVIEWING" || data.status === "FINANCE_REVIEWING")
  );

  const showError = async (error: unknown, fallback: string) => {
    await Taro.showToast({
      title: error instanceof Error ? error.message : fallback,
      icon: "none",
      duration: 2800
    });
  };

  const uploadAttachment = async (line: ReimbursementLine | null, type: ReimbursementAttachment["type"]) => {
    if (!data) return;
    try {
      const result = await Taro.chooseMessageFile({ count: 1, type: "file" });
      const file = result.tempFiles[0];
      if (!file) return;
      setBusy(true);
      await api.uploadReimbursementAttachment(data.id, {
        lineId: line?.id,
        type,
        filePath: file.path,
        fileName: file.name,
        size: file.size
      });
      await batch.reload();
      await Taro.showToast({ title: "上传成功", icon: "success" });
    } catch (error) {
      await showError(error, "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const performAction = async (type: "SUBMIT" | "APPROVE" | "REJECT") => {
    if (!data) return;
    try {
      setBusy(true);
      if (type === "SUBMIT") await api.submitReimbursement(data.id);
      if (type === "APPROVE") await api.approveReimbursement(data.id, comment);
      if (type === "REJECT") await api.rejectReimbursement(data.id, comment);
      setComment("");
      await batch.reload();
      await Taro.showToast({ title: "处理成功", icon: "success" });
    } catch (error) {
      await showError(error, "处理失败");
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async () => {
    if (!data || !issueDescription.trim()) return;
    try {
      setBusy(true);
      await api.createReimbursementIssue(data.id, {
        type: issueType,
        description: issueDescription.trim(),
        lineId: issueLineId || undefined
      });
      setIssueDescription("");
      setIssueLineId("");
      await batch.reload();
      await Taro.showToast({ title: "问题已标记", icon: "success" });
    } catch (error) {
      await showError(error, "标记失败");
    } finally {
      setBusy(false);
    }
  };

  const resolveIssue = async (issueId: string) => {
    const resolution = resolutions[issueId]?.trim();
    if (!resolution) return;
    try {
      setBusy(true);
      await api.resolveReimbursementIssue(data!.id, issueId, resolution);
      await batch.reload();
      await Taro.showToast({ title: "问题已解决", icon: "success" });
    } catch (error) {
      await showError(error, "处理失败");
    } finally {
      setBusy(false);
    }
  };

  const registerPayment = async () => {
    if (!data || !paymentReference.trim() || !paymentProofId) return;
    try {
      setBusy(true);
      await api.registerReimbursementPayment(data.id, {
        reference: paymentReference.trim(),
        paidAt: paymentDate,
        proofAttachmentId: paymentProofId
      });
      await batch.reload();
      await Taro.showToast({ title: "付款已登记", icon: "success" });
    } catch (error) {
      await showError(error, "登记失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="报销详情" subtitle={data ? `${data.batchNo} · ${data.applicantName}` : "加载中"}>
      <AsyncBoundary loading={batch.loading} error={batch.error} empty={!batch.loading && !data} emptyText="未找到报销单">
        {data ? (
          <>
            <SectionCard title="基本信息" extra={<StatusTag status={reimbursementStatusLabel[data.status] ?? data.status} />}>
              <FieldRow label="报销人" value={data.applicantName} />
              <FieldRow label="部门" value={data.departmentName} />
              <FieldRow label="报销总额" value={`¥${centsToYuan(data.totalPaymentCents)}`} />
              <FieldRow label="发票总额" value={`¥${centsToYuan(data.totalInvoiceCents)}`} />
              <FieldRow label="提交时间" value={formatDate(data.submittedAt)} />
            </SectionCard>

            {data.lines.map((line) => (
              <SectionCard key={line.id} title={line.purpose} extra={<Text>¥{centsToYuan(line.paymentCents)}</Text>}>
                <FieldRow label="费用类型" value={line.expenseType} />
                <FieldRow label="付款金额" value={`¥${centsToYuan(line.paymentCents)}`} />
                <FieldRow label="发票金额" value={`¥${centsToYuan(line.invoiceCents)}`} />
                {editable ? (
                  <View className="button-row">
                    <Button size="mini" onClick={() => uploadAttachment(line, "PAYMENT_VOUCHER")}>上传付款凭证</Button>
                    <Button size="mini" onClick={() => uploadAttachment(line, "INVOICE")}>上传发票</Button>
                  </View>
                ) : null}
              </SectionCard>
            ))}

            <SectionCard title="附件">
              {data.attachments.length ? data.attachments.map((attachment) => (
                <FieldRow
                  key={attachment.id}
                  label={attachmentLabels[attachment.type]}
                  value={attachment.fileName}
                />
              )) : <Text className="muted">暂无附件</Text>}
              {editable ? (
                <Button size="mini" onClick={() => uploadAttachment(null, "SUPPORTING")} disabled={busy}>上传辅助材料</Button>
              ) : null}
            </SectionCard>

            {openIssues.length || issueAllowed ? (
              <SectionCard title="问题处理">
                {openIssues.map((issue) => (
                  <View key={issue.id} className="issue-card">
                    <Text>{issue.type}：{issue.description}</Text>
                    {supplementAllowed ? (
                      <>
                        <TextAreaField
                          label="处理说明"
                          value={resolutions[issue.id] ?? ""}
                          onChange={(value) => setResolutions((current) => ({ ...current, [issue.id]: value }))}
                        />
                        <Button size="mini" onClick={() => resolveIssue(issue.id)} disabled={busy}>提交补充说明</Button>
                      </>
                    ) : null}
                  </View>
                ))}
                {issueAllowed ? (
                  <>
                    <SelectField label="问题类型" value={issueType} options={issueTypes} onChange={setIssueType} />
                    <SelectField
                      label="关联明细"
                      value={issueLineId}
                      options={[{ label: "整单", value: "" }, ...data.lines.map((line) => ({ label: line.purpose, value: line.id }))]}
                      onChange={setIssueLineId}
                    />
                    <TextAreaField label="问题说明" value={issueDescription} onChange={setIssueDescription} />
                    <Button size="mini" onClick={createIssue} disabled={busy || !issueDescription.trim()}>标记问题</Button>
                  </>
                ) : null}
              </SectionCard>
            ) : null}

            {action ? (
              <SectionCard title="审批处理">
                <TextAreaField label="审批意见" value={comment} onChange={setComment} />
                <View className="button-row">
                  {action === "SUBMIT" ? <Button type="primary" onClick={() => performAction("SUBMIT")} disabled={busy}>提交审批</Button> : null}
                  {action === "APPROVE" ? <Button type="primary" onClick={() => performAction("APPROVE")} disabled={busy}>通过</Button> : null}
                  {action === "APPROVE" ? <Button onClick={() => performAction("REJECT")} disabled={busy}>退回</Button> : null}
                </View>
              </SectionCard>
            ) : null}

            {user.permissions.includes(reimbursementPermissions.pay) && data.status === "PAYING" ? (
              <SectionCard title="付款登记">
                <TextField label="付款流水号" value={paymentReference} onChange={setPaymentReference} />
                <DateField label="付款日期" value={paymentDate} onChange={setPaymentDate} />
                <FormField label="付款凭证">
                  <Button size="mini" onClick={() => uploadAttachment(null, "PAYMENT_VOUCHER")} disabled={busy}>上传整批付款凭证</Button>
                  {paymentProofId ? <Text className="success-text">已选择付款凭证</Text> : null}
                </FormField>
                <Button type="primary" onClick={registerPayment} disabled={busy || !paymentReference.trim() || !paymentProofId}>登记付款</Button>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </AsyncBoundary>
    </PageShell>
  );
}
