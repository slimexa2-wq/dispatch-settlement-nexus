import Taro from "@tarojs/taro";
import { Input, View } from "@tarojs/components";
import { useState } from "react";
import { api } from "../../../api/services";
import { AccessDenied, AsyncBoundary, PageShell, PersonCard } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function SupplierPeoplePage() {
  const user = useSession();
  const params = Taro.getCurrentInstance().router?.params ?? {};
  const [keyword, setKeyword] = useState("");
  const people = useAsyncData(
    () => api.people({ keyword, status: params.status, interviewStatus: params.interviewStatus }),
    [keyword, params.status, params.interviewStatus]
  );

  if (!user) return <PageShell title="我的人员" />;
  if (user.role !== "SUPPLIER" || !user.permissions.includes("people:read")) {
    return <AccessDenied message="供应商人员页面仅展示当前供应商自己报送的数据。" />;
  }

  return (
    <PageShell title="我的人员" subtitle="身份证、附件、保险等敏感信息不会在供应商端展示">
      <Input className="form-control" value={keyword} placeholder="搜索姓名、手机号或项目" onConfirm={() => void people.reload()} onInput={(event) => setKeyword(event.detail.value)} />
      <ViewSpacer />
      <AsyncBoundary loading={people.loading} error={people.error} empty={!people.data?.items.length} emptyText="暂未报送人员" onRetry={() => void people.reload()}>
        {(people.data?.items ?? []).map((person) => <PersonCard key={person.id} person={person} />)}
      </AsyncBoundary>
    </PageShell>
  );
}

function ViewSpacer() {
  return <View className="spacer" />;
}
