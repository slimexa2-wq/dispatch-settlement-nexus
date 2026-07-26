import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { useEffect, useMemo, useState } from "react";
import { allJobs, allProjects, allPublicJobs, api } from "../api/services";
import type { RegistrationInput } from "../api/types";
import { normalizeRegistration, validateRegistration } from "../domain/validation";
import { useAsyncData } from "../hooks/useAsyncData";
import { DateField, FormField, SelectField, TextAreaField, TextField } from "./form";
import { AsyncBoundary, SectionCard } from "./ui";

const emptyForm = (source: RegistrationInput["source"]): RegistrationInput => ({
  name: "",
  idCard: "",
  phone: "",
  projectId: "",
  jobDemandId: null,
  jobTitle: "",
  interviewDate: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelation: null,
  source,
  notes: null
});

export function RegistrationForm({
  source,
  initialJobId,
  publicMode = false,
  referralToken,
  submitText,
  onSuccess
}: {
  source: RegistrationInput["source"];
  initialJobId?: string;
  publicMode?: boolean;
  referralToken?: string;
  submitText: string;
  onSuccess?: () => void;
}) {
  const [form, setForm] = useState<RegistrationInput>(() => emptyForm(source));
  const [submitting, setSubmitting] = useState(false);
  const projects = useAsyncData(
    () => source === "OPERATOR" ? allProjects() : Promise.resolve(null),
    [source]
  );
  const jobs = useAsyncData(
    () => publicMode ? allPublicJobs({ status: "RECRUITING" }) : allJobs({ status: "RECRUITING" }),
    [publicMode]
  );

  const projectOptions = source === "OPERATOR"
    ? (projects.data?.items ?? []).map((item) => ({ label: item.name, value: item.id }))
    : Array.from(new Map(
        (jobs.data?.items ?? []).map((item) => [
          item.projectId,
          { label: item.project?.name ?? item.projectName ?? "综合招聘项目", value: item.projectId }
        ])
      ).values());
  const availableJobs = useMemo(
    () => (jobs.data?.items ?? []).filter((item) => !form.projectId || item.projectId === form.projectId),
    [form.projectId, jobs.data]
  );
  const jobOptions = availableJobs.map((item) => ({ label: item.title, value: item.id }));

  useEffect(() => {
    if (!initialJobId || !jobs.data) return;
    const job = jobs.data.items.find((item) => item.id === initialJobId);
    if (job) {
      setForm((current) => ({ ...current, projectId: job.projectId, jobDemandId: job.id, jobTitle: job.title }));
    }
  }, [initialJobId, jobs.data]);

  const update = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectJob = (id: string) => {
    const job = jobs.data?.items.find((item) => item.id === id);
    update("jobDemandId", id);
    if (job) {
      setForm((current) => ({ ...current, jobDemandId: id, projectId: job.projectId, jobTitle: job.title }));
    }
  };

  const submit = async () => {
    const input = normalizeRegistration(form);
    const errors = validateRegistration(input);
    if (errors.length) {
      await Taro.showModal({ title: "请完善报名信息", content: errors.join("\n"), showCancel: false });
      return;
    }
    if (source !== "OPERATOR" && !input.jobDemandId) {
      await Taro.showToast({ title: "请选择招聘岗位", icon: "none" });
      return;
    }
    setSubmitting(true);
    try {
      if (publicMode) {
        await api.createPublicApplication({ ...input, referralToken });
      } else if (source === "OPERATOR") {
        await api.registerPerson(input);
      } else if (source === "REFERRAL") {
        await api.createReferral(input);
      } else {
        await api.createApplication(input);
      }
      await Taro.showModal({
        title: source === "REFERRAL" ? "推荐已提交" : "报名已提交",
        content: publicMode
          ? "报名请求已受理。为保护既有档案，身份证号已存在时不会匿名覆盖资料；请完成账号或微信身份绑定后查询进度。"
          : "身份证号重复时系统会沿用原人员档案，不会重复建档。",
        showCancel: false
      });
      setForm(emptyForm(source));
      onSuccess?.();
    } catch (error) {
      await Taro.showModal({
        title: "提交失败",
        content: error instanceof Error ? error.message : "请稍后重试",
        showCancel: false
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AsyncBoundary
      loading={jobs.loading || (source === "OPERATOR" && projects.loading)}
      error={jobs.error ?? (source === "OPERATOR" ? projects.error : null)}
      onRetry={() => {
        void projects.reload();
        void jobs.reload();
      }}
    >
      <View className="notice">人员只建立一次主档案；已有人员再次报名时由身份证号查重并更新原档案。</View>
      <SectionCard title="报名信息">
        <FormField label="姓名" required>
          <TextField value={form.name} placeholder="请输入真实姓名" onChange={(value) => update("name", value)} maxlength={64} />
        </FormField>
        <FormField label="身份证号" required hint="仅用于查重与业务办理，提交后按权限隔离。">
          <TextField value={form.idCard} placeholder="请输入身份证号" type="idcard" onChange={(value) => update("idCard", value)} maxlength={18} />
        </FormField>
        <FormField label="手机号" required>
          <TextField value={form.phone} placeholder="请输入 11 位手机号" type="number" onChange={(value) => update("phone", value)} maxlength={11} />
        </FormField>
        <FormField label="项目" required>
          <SelectField
            value={form.projectId}
            options={projectOptions}
            placeholder="请选择项目"
            onChange={(value) => setForm((current) => ({ ...current, projectId: value, jobDemandId: null, jobTitle: "" }))}
          />
        </FormField>
        <FormField label="招聘岗位" required={source !== "OPERATOR"} hint={source === "OPERATOR" ? "无已发布岗位时可填写岗位名称。" : "岗位与项目、政策和负责人自动关联。"}>
          {jobOptions.length ? (
            <SelectField value={form.jobDemandId ?? ""} options={jobOptions} placeholder="请选择招聘岗位" onChange={selectJob} />
          ) : (
            <TextField value={form.jobTitle} placeholder="当前项目无开放岗位，请填写岗位" onChange={(value) => update("jobTitle", value)} />
          )}
        </FormField>
        {source === "OPERATOR" ? (
          <FormField label="面试日期">
            <DateField value={form.interviewDate ?? ""} onChange={(value) => update("interviewDate", value)} />
          </FormField>
        ) : null}
      </SectionCard>
      <SectionCard title="紧急联系人">
        <FormField label="姓名">
          <TextField value={form.emergencyContactName ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactName", value)} maxlength={64} />
        </FormField>
        <FormField label="联系方式">
          <TextField value={form.emergencyContactPhone ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactPhone", value)} maxlength={32} />
        </FormField>
        <FormField label="与本人关系">
          <TextField value={form.emergencyContactRelation ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactRelation", value)} maxlength={32} />
        </FormField>
        <FormField label="备注">
          <TextAreaField value={form.notes ?? ""} placeholder="记录必要的特殊情况，不编造缺失信息" onChange={(value) => update("notes", value)} />
        </FormField>
      </SectionCard>
      <Button className="button" loading={submitting} disabled={submitting} onClick={() => void submit()}>{submitText}</Button>
      <Text className="muted">
        {publicMode
          ? "公开报名仅受理首报；既有人员需登录并完成身份校验后继续办理。"
          : "供应商与推荐人由当前登录身份自动绑定，页面不允许自由选择或冒用。"}
      </Text>
    </AsyncBoundary>
  );
}
