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
  const [issueType, setIssueType] = useState(issueTypes[0].value);
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
      const uploaded = await api.uploadReimbursementAttachment(data.id, line?.id ?? null, type, file.path, file.name);
      if (!line && type === "PAYMENT_VOUCHER") setPaymentProofId(uploaded.id);
      await Taro.showToast({ title: "材料上传成功", icon: "success" });
      await batch.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("cancel")) await showError(error, "材料上传失败");
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (attachment: ReimbursementAttachment) => {
    if (!data) return;
    try {
      setBusy(true);
      const filePath = await api.downloadReimbursementAttachment(data.id, attachment.id);
      if (attachment.mimeType.startsWith("image/")) {
        await Taro.previewImage({ urls: [filePath], current: filePath });
      } else {
        await Taro.openDocument({ filePath, showMenu: true });
      }
    } catch (error) {
      await showError(error, "无法打开材料");
    } finally {
      setBusy(false);
    }
  };

  const openArtifact = async (artifact: NonNullable<typeof data>["artifacts"][number]) => {
    if (!data) return;
    if (artifact.type !== "REIMBURSEMENT_FORM") {
      await Taro.showModal({
        title: "请在电脑端下载",
        content: "付款凭证包和发票包当前为 ZIP 压缩包，微信小程序不能直接预览，请在电脑端后台下载解压。",
        showCancel: false
      });
      return;
    }
    try {
      setBusy(true);
      const filePath = await api.downloadReimbursementArtifact(data.id, artifact.id);
      await Taro.openDocument({ filePath, showMenu: true });
    } catch (error) {
      await showError(error, "报销表打开失败");
    } finally {
      setBusy(false);
    }
  };

  const runTransition = async () => {
    if (!data || !action || action.kind !== "transition") return;
    if (openIssues.length) {
      await Taro.showToast({ title: "请先解决全部待处理问题", icon: "none" });
      return;
    }
    const confirmed = await Taro.showModal({
      title: action.label,
      content: `确认将报销单流转至“${reimbursementStatusLabel(action.targetStatus)}”吗？`
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    try {
      await api.transitionReimbursement(data.id, {
        expectedVersion: data.version,
        targetStatus: action.targetStatus,
        comment: comment.trim() || undefined
      });
      setComment("");
      await Taro.showToast({ title: "处理成功", icon: "success" });
      await batch.reload();
    } catch (error) {
      await showError(error, "处理失败");
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async () => {
    if (!data || !issueDescription.trim()) {
      await Taro.showToast({ title: "请填写问题说明", icon: "none" });
      return;
    }
    setBusy(true);
    try {
      await api.createReimbursementIssue(data.id, {
        lineId: issueLineId || null,
        type: issueType,
        description: issueDescription.trim()
      });
      setIssueDescription("");
      setIssueLineId("");
      await Taro.showToast({ title: "问题已记录", icon: "success" });
      await batch.reload();
    } catch (error) {
      await showError(error, "问题记录失败");
    } finally {
      setBusy(false);
    }
  };

  const resolveIssue = async (issueId: string) => {
    if (!data || !resolutions[issueId]?.trim()) {
      await Taro.showToast({ title: "请填写处理结果", icon: "none" });
      return;
    }
    setBusy(true);
    try {
      await api.resolveReimbursementIssue(data.id, issueId, resolutions[issueId].trim());
      setResolutions((current) => ({ ...current, [issueId]: "" }));
      await Taro.showToast({ title: "问题已解决", icon: "success" });
      await batch.reload();
    } catch (error) {
      await showError(error, "问题处理失败");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!data || action?.kind !== "payment") return;
    if (!paymentReference.trim()) {
      await Taro.showToast({ title: "请填写付款流水号", icon: "none" });
      return;
    }
    if (!paymentProofId) {
      await Taro.showToast({ title: "请先上传最终付款凭证", icon: "none" });
      return;
    }
    const confirmed = await Taro.showModal({
      title: "登记付款",
      content: `确认已支付 ¥${centsToYuan(data.approvedAmountCents ?? data.totalPaymentCents)} 吗？`
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    try {
      await api.payReimbursement(data.id, {
        expectedVersion: data.version,
        amountCents: data.approvedAmountCents ?? data.totalPaymentCents,
        reference: paymentReference.trim(),
        paidAt: `${paymentDate}T00:00:00.000Z`,
        proofAttachmentId: paymentProofId
      });
      await Taro.showToast({ title: "付款登记完成", icon: "success" });
      await batch.reload();
    } catch (error) {
      await showError(error, "付款登记失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="报销详情" subtitle="所有操作均保留处理人、节点、意见和版本记录">
      <AsyncBoundary loading={batch.loading} error={batch.error} empty={!data} onRetry={() => void batch.reload()}>
        {data ? (
          <>
            <SectionCard>
              <View className="card-title-row">
                <Text className="page-title">{data.title}</Text>
                <StatusTag status={data.status} label={reimbursementStatusLabel(data.status)} />
              </View>
              <Text className="card-meta">{data.code} · 版本 {data.version}</Text>
              <Text className="reimbursement-money">¥{centsToYuan(data.approvedAmountCents ?? data.totalPaymentCents)}</Text>
            </SectionCard>

            <SectionCard title="申请信息">
              <FieldRow label="申请人" value={data.applicant.displayName} />
              <FieldRow label="所属部门" value={data.organizationUnit?.name ?? "未关联"} />
              <FieldRow label="所属项目" value={data.project?.name ?? "未关联"} />
              <FieldRow label="创建日期" value={formatDate(data.createdAt)} />
              <FieldRow label="申报金额" value={`¥${centsToYuan(data.totalPaymentCents)}`} />
              {data.approvedAmountCents !== null && data.approvedAmountCents !== undefined ? (
                <FieldRow label="审核通过金额" value={`¥${centsToYuan(data.approvedAmountCents)}`} />
              ) : null}
              <FieldRow label="发票合计" value={`¥${centsToYuan(data.totalInvoiceCents)}`} />
              <FieldRow label="票据覆盖差额" value={`¥${centsToYuan(data.invoiceExcessCents)}`} />
            </SectionCard>

            {data.lines.map((line) => (
              <SectionCard key={line.id} title={`明细 ${line.sequence} · ${line.category}`}>
                <FieldRow label="费用日期" value={formatDate(line.expenseDate)} />
                <FieldRow label="费用用途" value={line.description} />
                <FieldRow label="付款金额" value={`¥${centsToYuan(line.paymentCents)}`} />
                <FieldRow label="发票金额" value={`¥${centsToYuan(line.invoiceCents)}`} />
                <FieldRow label="收款人" value={line.payeeName ?? "未填写"} />
                <FieldRow label="收款账号" value={line.payeeAccount ?? "未填写"} sensitive />
                <FieldRow label="开户行" value={line.payeeBank ?? "未填写"} />

                <View className="reimbursement-materials">
                  {line.attachments.length ? line.attachments.map((attachment) => (
                    <View className="reimbursement-file" key={attachment.id} onClick={() => void openAttachment(attachment)}>
                      <Text>{attachmentLabels[attachment.type]} · {attachment.originalName}</Text>
                      <Text className="link-text">查看 ›</Text>
                    </View>
                  )) : <Text className="muted">本明细尚未上传付款凭证或发票</Text>}
                </View>
                {editable ? (
                  <View className="action-row">
                    <Button className="button button--ghost" disabled={busy} onClick={() => void uploadAttachment(line, "PAYMENT_VOUCHER")}>上传付款凭证</Button>
                    <Button className="button button--ghost" disabled={busy} onClick={() => void uploadAttachment(line, "INVOICE")}>上传发票</Button>
                  </View>
                ) : null}
              </SectionCard>
            ))}

            <SectionCard title="问题与补充">
              {supplementAllowed ? (
                <View className="reimbursement-issue-form">
                  <Text className="card-note">审核人员已提出问题，可在这里补传说明或证明材料。上传后请等待审核人员核验并关闭问题。</Text>
                  <Button className="button button--ghost" disabled={busy} onClick={() => void uploadAttachment(null, "SUPPORTING")}>补充上传材料</Button>
                </View>
              ) : null}
              {data.issues.length ? data.issues.map((issue) => (
                <View className={issue.status === "OPEN" ? "reimbursement-issue reimbursement-issue--open" : "reimbursement-issue"} key={issue.id}>
                  <View className="card-title-row">
                    <Text className="card-title">{issue.type}</Text>
                    <StatusTag status={issue.status} label={issue.status === "OPEN" ? "待处理" : "已解决"} />
                  </View>
                  <Text className="card-note">{issue.description}</Text>
                  <Text className="card-meta">提出人：{issue.raisedBy?.displayName ?? "系统"} · {formatDate(issue.createdAt)}</Text>
                  {issue.resolution ? <Text className="card-note">处理结果：{issue.resolution}</Text> : null}
                  {issueAllowed && issue.status === "OPEN" ? (
                    <>
                      <TextAreaField
                        value={resolutions[issue.id] ?? ""}
                        placeholder="填写处理结果"
                        onChange={(value) => setResolutions((current) => ({ ...current, [issue.id]: value }))}
                        maxlength={500}
                      />
                      <Button className="button button--secondary" disabled={busy} onClick={() => void resolveIssue(issue.id)}>标记已解决</Button>
                    </>
                  ) : null}
                </View>
              )) : <Text className="muted">暂无问题记录</Text>}

              {issueAllowed ? (
                <View className="reimbursement-issue-form">
                  <FormField label="问题类型">
                    <SelectField value={issueType} options={issueTypes} placeholder="请选择问题类型" onChange={setIssueType} />
                  </FormField>
                  <FormField label="关联明细">
                    <SelectField
                      value={issueLineId}
                      options={[{ label: "整张报销单", value: "" }, ...data.lines.map((line) => ({ label: `明细 ${line.sequence} · ${line.category}`, value: line.id }))]}
                      placeholder="整张报销单"
                      onChange={setIssueLineId}
                    />
                  </FormField>
                  <FormField label="问题说明">
                    <TextAreaField value={issueDescription} placeholder="说明缺失材料、金额差异或需补充事项" onChange={setIssueDescription} maxlength={500} />
                  </FormField>
                  <Button className="button button--ghost" disabled={busy} onClick={() => void createIssue()}>记录问题</Button>
                </View>
              ) : null}
            </SectionCard>

            <SectionCard title="审批记录">
              {data.approvals.length ? data.approvals.map((approval) => (
                <View className="reimbursement-approval" key={approval.id}>
                  <Text className="card-title">{reimbursementStatusLabel(approval.fromStatus)} → {reimbursementStatusLabel(approval.toStatus)}</Text>
                  <Text className="card-meta">{approval.actor?.displayName ?? "系统"} · {formatDate(approval.createdAt)}</Text>
                  {approval.comment ? <Text className="card-note">{approval.comment}</Text> : null}
                </View>
              )) : <Text className="muted">尚未进入审批流程</Text>}
            </SectionCard>

            {action?.kind === "transition" ? (
              <SectionCard title="当前待办">
                <FormField label="处理意见" hint="选填，提交后进入操作日志">
                  <TextAreaField value={comment} placeholder="填写审核或交接意见" onChange={setComment} maxlength={500} />
                </FormField>
                <Button className="button" disabled={busy || openIssues.length > 0} loading={busy} onClick={() => void runTransition()}>{action.label}</Button>
                {openIssues.length ? <Text className="form-hint">存在 {openIssues.length} 个待处理问题，解决后才能继续流转。</Text> : null}
              </SectionCard>
            ) : null}

            {action?.kind === "payment" ? (
              <SectionCard title="付款登记">
                <FormField label="付款日期" required>
                  <DateField value={paymentDate} onChange={setPaymentDate} />
                </FormField>
                <FormField label="付款流水号" required>
                  <TextField value={paymentReference} placeholder="填写银行流水号" onChange={setPaymentReference} maxlength={120} />
                </FormField>
                <Button className="button button--ghost" disabled={busy} onClick={() => void uploadAttachment(null, "PAYMENT_VOUCHER")}>
                  {paymentProofId ? "重新上传最终付款凭证" : "上传最终付款凭证"}
                </Button>
                <Button className="button" disabled={busy || !paymentProofId} loading={busy} onClick={() => void pay()}>登记付款</Button>
              </SectionCard>
            ) : null}

            {data.payment ? (
              <SectionCard title="付款结果">
                <FieldRow label="付款金额" value={`¥${centsToYuan(data.payment.amountCents)}`} />
                <FieldRow label="付款日期" value={formatDate(data.payment.paidAt)} />
                <FieldRow label="付款流水号" value={data.payment.reference} sensitive />
              </SectionCard>
            ) : null}

            {user.permissions.includes(reimbursementPermissions.export) && data.artifacts.length ? (
              <SectionCard title="财务材料">
                {data.artifacts.filter((artifact) => artifact.status === "GENERATED").map((artifact) => (
                  <View className="reimbursement-file" key={artifact.id} onClick={() => void openArtifact(artifact)}>
                    <Text>{artifact.originalName ?? artifact.type}</Text>
                    <Text className="link-text">{artifact.type === "REIMBURSEMENT_FORM" ? "打开 ›" : "电脑端下载 ›"}</Text>
                  </View>
                ))}
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </AsyncBoundary>
    </PageShell>
  );
}
