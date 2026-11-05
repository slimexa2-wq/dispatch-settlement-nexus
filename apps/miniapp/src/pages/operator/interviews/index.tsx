import Taro from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import { DateField, SelectField } from "../../../components/form";
import { AccessDenied, AsyncBoundary, PageShell, PersonCard, SectionCard } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { localDateString } from "../../../domain/format";

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "待到场", value: "PENDING_ARRIVAL" },
  { label: "已到场", value: "ARRIVED" },
  { label: "面试通过", value: "PASSED" },
  { label: "面试未通过", value: "FAILED" },
  { label: "放弃", value: "ABANDONED" }
];

export default function InterviewListPage() {
  const user = useSession();
  const params = Taro.getCurrentInstance().router?.params ?? {};
  const [date, setDate] = useState(localDateString());
  const [status, setStatus] = useState(params.status ?? "ALL");
  const people = useAsyncData(
    () => api.people({ interviewDate: date, interviewStatus: status === "ALL" ? undefined : status }),
    [date, status]
  );

  if (!user) return <PageShell title="面试名单" />;
  if (!user.permissions.includes("people:write")) return <AccessDenied />;

  const updateStatus = async (id: string) => {
    const labels = ["已到场", "面试通过", "面试未通过", "放弃"];
    const values = ["ARRIVED", "PASSED", "FAILED", "ABANDONED"];
    try {
      const choice = await Taro.showActionSheet({ itemList: labels });
      const nextStatus = values[choice.tapIndex];
      if (!nextStatus) return;
      await api.updateInterview(id, nextStatus);
      await Taro.showToast({ title: "面试状态已更新", icon: "success" });
      await people.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("cancel")) {
        await Taro.showToast({ title: message || "更新失败", icon: "none" });
      }
    }
  };

  return (
    <PageShell title="面试名单" subtitle="点击人员后直接选择到场或面试结果">
      <SectionCard title="筛选">
        <View className="action-row">
          <View>
            <Text className="form-label">面试日期</Text>
            <DateField value={date} onChange={setDate} />
          </View>
          <View>
            <Text className="form-label">面试状态</Text>
            <SelectField value={status} options={statusOptions} placeholder="全部状态" onChange={setStatus} />
          </View>
        </View>
      </SectionCard>
      <AsyncBoundary loading={people.loading} error={people.error} empty={!people.data?.items.length} emptyText="当日暂无面试人员" onRetry={() => void people.reload()}>
        {(people.data?.items ?? []).map((person) => <PersonCard key={person.id} person={person} showSensitive onClick={() => void updateStatus(person.id)} />)}
      </AsyncBoundary>
    </PageShell>
  );
}
