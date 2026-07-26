import Taro from "@tarojs/taro";
import { Button, Input, View } from "@tarojs/components";
import { useState } from "react";
import { allProjects, api } from "../../../api/services";
import { SelectField } from "../../../components/form";
import { AccessDenied, AsyncBoundary, PageShell, PersonCard, SectionCard } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "已报名", value: "APPLICANT" },
  { label: "面试中", value: "INTERVIEWING" },
  { label: "待入职", value: "PENDING_ONBOARD" },
  { label: "在职", value: "ACTIVE" },
  { label: "离职", value: "LEFT" }
];

export default function PeopleListPage() {
  const user = useSession();
  const params = Taro.getCurrentInstance().router?.params ?? {};
  const [keyword, setKeyword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState(params.status ?? "ALL");
  const [projectId, setProjectId] = useState("");
  const projects = useAsyncData(() => allProjects(), []);
  const people = useAsyncData(
    () => api.people({ keyword: searchTerm, status: status === "ALL" ? undefined : status, projectId: projectId || undefined }),
    [searchTerm, status, projectId]
  );

  if (!user) return <PageShell title="人员查询" />;
  if (!user.permissions.includes("people:read")) return <AccessDenied />;
  const projectOptions = [{ label: "全部项目", value: "ALL" }].concat(
    (projects.data?.items ?? []).map((project) => ({ label: project.name, value: project.id }))
  );

  return (
    <PageShell title="人员查询" subtitle="查询结果受当前账号分子公司、项目或供应商数据范围限制">
      <View className="toolbar">
        <Input className="form-control" value={keyword} placeholder="姓名、身份证号或手机号" onInput={(event) => setKeyword(event.detail.value)} />
        <Button className="button button--compact" onClick={() => setSearchTerm(keyword.trim())}>查询</Button>
      </View>
      <SectionCard title="筛选">
        <View className="action-row">
          <SelectField value={status} options={statusOptions} placeholder="全部状态" onChange={setStatus} />
          <SelectField value={projectId || "ALL"} options={projectOptions} placeholder="全部项目" onChange={(value) => setProjectId(value === "ALL" ? "" : value)} />
        </View>
      </SectionCard>
      <AsyncBoundary loading={people.loading || projects.loading} error={people.error ?? projects.error} empty={!people.data?.items.length} emptyText="没有符合条件的人员" onRetry={() => void people.reload()}>
        {(people.data?.items ?? []).map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            showSensitive
            onClick={() => void Taro.navigateTo({ url: "/pages/operator/person-detail/index?id=" + encodeURIComponent(person.id) })}
          />
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
