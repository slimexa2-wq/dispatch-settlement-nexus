import type { Person } from "../types/domain";

export type RegistrationResult = {
  person: Person;
  application?: unknown;
  deduplicated: boolean;
};

export type PeopleUrlFilters = {
  metric?: string;
  anomalyId?: string;
  keyword?: string;
  branchId?: string;
  projectId?: string;
  supplierId?: string;
  recommenderUserId?: string;
  status?: string;
  interviewStatus?: string;
  insurance?: string;
  interviewDate?: string;
  from?: string;
  to?: string;
};

export function peopleFiltersFromSearchParams(searchParams: URLSearchParams): PeopleUrlFilters {
  const value = (key: string) => searchParams.get(key) ?? undefined;
  return {
    metric: value("metric"),
    anomalyId: value("anomalyId"),
    keyword: value("keyword"),
    branchId: value("branchId"),
    projectId: value("projectId"),
    supplierId: value("supplierId"),
    recommenderUserId: value("recommenderUserId"),
    status: value("status") ?? value("employmentStatus"),
    interviewStatus: value("interviewStatus"),
    insurance: value("insurance"),
    interviewDate: value("interviewDate"),
    from: value("from"),
    to: value("to")
  };
}

export function registrationResultMessage(result: RegistrationResult): string {
  return result.deduplicated
    ? `已识别 ${result.person.name} 的原档案，本次报名已归并`
    : `已创建 ${result.person.name} 的人员档案`;
}

export function peopleListEndpoint(metric?: string): "/statistics/drilldown" | "/people" {
  return metric ? "/statistics/drilldown" : "/people";
}
