import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { api } from "../../../api/services";
import { getAccessToken } from "../../../auth/session";
import { TextAreaField } from "../../../components/form";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { runtimeConfig } from "../../../config/runtime";
import { formatDate, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

const insuranceLabels: Record<string, string> = {
  COMMERCIAL: "商保",
  SOCIAL: "社保",
  RISK_FUND: "风险金"
};

export default function PersonDetailPage() {
  const user = useSession();
  const id = Taro.getCurrentInstance().router?.params.id ?? "";
  const person = useAsyncData(() => id ? api.person(id) : Promise.reject(new Error("缺少人员 ID")), [id]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setNotes(person.data?.notes ?? "");
  }, [person.data?.notes]);

  if (!user) return <PageShell title="人员详情" />;
  if (!user.permissions.includes("people:read")) return <AccessDenied />;
  const canWrite = user.permissions.includes("people:write");
  const data = person.data;

  const saveNotes = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await api.updateNotes(data.id, notes);
      await Taro.showToast({ title: "备注已保存", icon: "success" });
      await person.reload();
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  const chooseAndUpload = async () => {
    if (!data) return;
    try {
      const result = await Taro.chooseMessageFile({ count: 9, type: "file" });
      for (const file of result.tempFiles) {
        await api.uploadPersonFile(data.id, file.path, file.name);
      }
      await Taro.showToast({ title: "附件上传成功", icon: "success" });
      await person.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("cancel")) await Taro.showToast({ title: message || "附件上传失败", icon: "none" });
    }
  };

  const openFile = async (fileId: string, fileName: string) => {
    try {
      const token = getAccessToken();
      const response = await Taro.downloadFile({
        url: runtimeConfig.apiBaseUrl + "/people/" + encodeURIComponent(id) + "/files/" + encodeURIComponent(fileId),
        header: token ? { Authorization: "Bearer " + token } : {}
      });
      if (response.statusCode !== 200) throw new Error("附件下载失败");
      await Taro.openDocument({ filePath: response.tempFilePath, showMenu: true });
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "无法打开附件", icon: "none" });
    }
  };

  return (
    <PageShell title="人员详情" subtitle="报名、面试、入职、在职、离职均沿用此主档案">
      <AsyncBoundary loading={person.loading} error={person.error} empty={!data} onRetry={() => void person.reload()}>
        {data ? (
          <>
            <SectionCard>
              <View className="card-title-row">
                <Text className="page-title">{data.name}</Text>
                <StatusTag status={data.employmentStatus ?? data.status ?? data.interviewStatus} />
              </View>
              <Text className="card-meta">{projectName(data)} · {data.jobTitle ?? "综合岗位"}</Text>
            </SectionCard>
            <SectionCard title="基础信息">
              <FieldRow label="手机号" value={data.phone} sensitive />
              <FieldRow label="身份证号" value={data.idCard ?? "暂无"} sensitive />
              <FieldRow label="项目" value={projectName(data)} />
              <FieldRow label="岗位" value={data.jobTitle ?? "综合岗位"} />
              <FieldRow label="供应商" value={data.supplier?.name ?? "无"} />
              <FieldRow label="推荐人" value={data.recommender?.displayName ?? "无"} />
            </SectionCard>
            <SectionCard title="状态进度">
              <FieldRow label="面试状态" value={<StatusTag status={data.interviewStatus} />} />
              <FieldRow label="面试日期" value={formatDate(data.interviewDate)} />
              <FieldRow label="入职日期" value={formatDate(data.onboardDate)} />
              <FieldRow label="离职日期" value={formatDate(data.offboardDate)} />
              <FieldRow label="离职原因" value={data.offboardReason ?? "无"} />
              <FieldRow label="保险" value={(data.insuranceTypes ?? []).map((item) => insuranceLabels[item] ?? item).join("、") || "无"} />
            </SectionCard>
            <SectionCard title="附件">
              {(data.files ?? []).length ? (data.files ?? []).map((file) => (
                <View className="field-row" key={file.id} onClick={() => void openFile(file.id, file.originalName)}>
                  <Text className="field-row__value">{file.originalName}</Text>
                  <Text className="link-text">查看 ›</Text>
                </View>
              )) : <Text className="muted">暂无附件</Text>}
              {canWrite ? <Button className="button button--ghost" onClick={() => void chooseAndUpload()}>上传附件</Button> : null}
            </SectionCard>
            <SectionCard title="人员备注">
              <TextAreaField value={notes} placeholder="记录特殊情况" onChange={setNotes} />
              {canWrite ? <Button className="button button--secondary" loading={saving} disabled={saving} onClick={() => void saveNotes()}>保存备注</Button> : null}
            </SectionCard>
          </>
        ) : null}
      </AsyncBoundary>
    </PageShell>
  );
}
