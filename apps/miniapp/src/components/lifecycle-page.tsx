import Taro from "@tarojs/taro";
import { Button, Input, Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../api/services";
import type { Person } from "../api/types";
import { useAsyncData } from "../hooks/useAsyncData";
import { DateField, FormField, InsuranceField, TextAreaField, TextField } from "./form";
import { AccessDenied, AsyncBoundary, PageShell, PersonCard, SectionCard } from "./ui";
import { localDateString } from "../domain/format";

type Mode = "onboard" | "offboard";

export function LifecyclePage({ mode, canWrite }: { mode: Mode; canWrite: boolean }) {
  const [keyword, setKeyword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [date, setDate] = useState(localDateString());
  const [insuranceTypes, setInsuranceTypes] = useState<string[]>([]);
  const [employeeNo, setEmployeeNo] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const title = mode === "onboard" ? "入职登记" : "离职登记";
  const people = useAsyncData(
    () => api.people({ keyword: searchTerm, status: mode === "onboard" ? "PENDING_ONBOARD" : "ACTIVE" }),
    [searchTerm, mode]
  );

  if (!canWrite) return <AccessDenied />;

  const select = (person: Person) => {
    setSelected(person);
    setInsuranceTypes(person.insuranceTypes ?? []);
  };

  const submit = async () => {
    if (!selected) return;
    if (!date || (mode === "offboard" && !reason.trim())) {
      await Taro.showToast({ title: mode === "offboard" ? "请填写离职日期和原因" : "请选择入职日期", icon: "none" });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "onboard") {
        await api.onboard(selected.id, {
          onboardDate: date,
          insuranceTypes,
          employeeNo: employeeNo.trim() || undefined,
          notes: notes.trim() || undefined
        });
      } else {
        await api.offboard(selected.id, {
          offboardDate: date,
          offboardReason: reason.trim(),
          insuranceTypes,
          notes: notes.trim() || undefined
        });
      }
      await Taro.showToast({ title: mode === "onboard" ? "入职登记成功" : "离职登记成功", icon: "success" });
      setSelected(null);
      setReason("");
      setEmployeeNo("");
      setNotes("");
      await people.reload();
    } catch (error) {
      await Taro.showModal({ title: "登记失败", content: error instanceof Error ? error.message : "请稍后重试", showCancel: false });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title={title} subtitle="搜索人员、确认信息、提交状态，核心操作不超过三步">
      <View className="toolbar">
        <Input className="form-control" value={keyword} placeholder="输入姓名、手机号或身份证号" onInput={(event) => setKeyword(event.detail.value)} />
        <Button className="button button--compact" onClick={() => setSearchTerm(keyword.trim())}>查询</Button>
      </View>
      {selected ? (
        <SectionCard
          title={"已选择：" + selected.name}
          action={<Text className="link-text" onClick={() => setSelected(null)}>重新选择</Text>}
        >
          <FormField label={mode === "onboard" ? "入职日期" : "离职日期"} required>
            <DateField value={date} onChange={setDate} />
          </FormField>
          {mode === "onboard" ? (
            <FormField label="工号" hint="确有需要时填写，缺失可留空。">
              <TextField value={employeeNo} placeholder="可选" onChange={setEmployeeNo} maxlength={64} />
            </FormField>
          ) : (
            <FormField label="离职原因" required>
              <TextAreaField value={reason} placeholder="请填写实际离职原因" onChange={setReason} maxlength={500} />
            </FormField>
          )}
          <FormField label="保险情况" hint="支持商保、社保、风险金多选。">
            <InsuranceField value={insuranceTypes} onChange={setInsuranceTypes} />
          </FormField>
          <FormField label="备注">
            <TextAreaField value={notes} placeholder="记录必要特殊情况" onChange={setNotes} />
          </FormField>
          <Button className={mode === "offboard" ? "button button--danger" : "button"} loading={submitting} disabled={submitting} onClick={() => void submit()}>
            确认{title}
          </Button>
        </SectionCard>
      ) : (
        <AsyncBoundary loading={people.loading} error={people.error} empty={!people.data?.items.length} emptyText="没有符合条件的人员" onRetry={() => void people.reload()}>
          {(people.data?.items ?? []).map((person) => <PersonCard key={person.id} person={person} showSensitive onClick={() => select(person)} />)}
        </AsyncBoundary>
      )}
    </PageShell>
  );
}
