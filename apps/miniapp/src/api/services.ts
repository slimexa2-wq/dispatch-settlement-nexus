import { apiRequest, queryString, uploadFile } from "./client";
import type {
  Application,
  AppealRecord,
  AdvanceRequest,
  BlacklistRecord,
  ElectronicContract,
  JobDemand,
  Paginated,
  Person,
  PersonFile,
  Policy,
  Project,
  Referral,
  RegistrationInput,
  Reward,
  SalarySlip,
  SessionUser
} from "./types";

export type LoginResult = { token: string; user: SessionUser };
export type OverviewStatistics = {
  cards?: Record<string, number>;
  trend?: Array<{ date: string; onboarded: number; offboarded: number }>;
  recruitment?: { required: number; onboarded: number; remainingGap: number };
  [key: string]: unknown;
};

export const api = {
  login: (username: string, password: string) =>
    apiRequest<LoginResult>("/auth/login", {
      method: "POST",
      authenticated: false,
      data: { username, password }
    }),
  wechatLogin: (code: string) =>
    apiRequest<LoginResult>("/wechat/auth/login", {
      method: "POST",
      authenticated: false,
      data: { code }
    }),
  bindWechat: (code: string) =>
    apiRequest<{ bound: boolean }>("/wechat/bind", {
      method: "POST",
      data: { code }
    }),
  projects: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<Project>>(`/projects${queryString({ page: 1, pageSize: 200, ...params })}`),
  project: (id: string) => apiRequest<Project>(`/projects/${encodeURIComponent(id)}`),
  projectImages: (id: string) =>
    apiRequest<Project["images"]>(`/projects/${encodeURIComponent(id)}/images`),
  jobs: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<JobDemand>>(`/job-demands${queryString({ page: 1, pageSize: 100, ...params })}`),
  job: (id: string) => apiRequest<JobDemand>(`/job-demands/${encodeURIComponent(id)}`),
  publicJobs: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<JobDemand>>(`/public/job-demands${queryString({ page: 1, pageSize: 100, ...params })}`, { authenticated: false }),
  publicJob: (id: string) =>
    apiRequest<JobDemand>(`/public/job-demands/${encodeURIComponent(id)}`, { authenticated: false }),
  people: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<Person>>(`/people${queryString({ page: 1, pageSize: 100, ...params })}`),
  person: (id: string) => apiRequest<Person>(`/people/${encodeURIComponent(id)}`),
  registerPerson: (input: RegistrationInput) =>
    apiRequest<{ person: Person; application?: Application; deduplicated: boolean } | Person>("/people", { method: "POST", data: input }),
  updateInterview: (id: string, status: string, notes?: string) =>
    apiRequest<Person>(`/people/${encodeURIComponent(id)}/interview`, { method: "PATCH", data: { status, notes } }),
  onboard: (id: string, input: { onboardDate: string; insuranceTypes: string[]; employeeNo?: string; notes?: string }) =>
    apiRequest<Person>(`/people/${encodeURIComponent(id)}/onboard`, { method: "PATCH", data: input }),
  offboard: (id: string, input: { offboardDate: string; offboardReason: string; insuranceTypes: string[]; notes?: string }) =>
    apiRequest<Person>(`/people/${encodeURIComponent(id)}/offboard`, { method: "PATCH", data: input }),
  updateNotes: (id: string, notes: string) =>
    apiRequest<Person>(`/people/${encodeURIComponent(id)}/notes`, { method: "PATCH", data: { notes } }),
  uploadPersonFile: (id: string, filePath: string, originalName: string) =>
    uploadFile<PersonFile>(`/people/${encodeURIComponent(id)}/files`, filePath, originalName),
  createApplication: (input: RegistrationInput) =>
    apiRequest<{ application: Application; person: Person; deduplicated: boolean } | Application>("/applications", {
      method: "POST",
      data: input
    }),
  createPublicApplication: (input: RegistrationInput & { referralToken?: string }) =>
    apiRequest<{ accepted: true; message: string }>("/public/applications", {
      method: "POST",
      authenticated: false,
      data: input
    }),
  myApplications: () => apiRequest<Paginated<Application> | Application[]>("/applications/me"),
  createReferral: (input: RegistrationInput) =>
    apiRequest<{ application: Application; person: Person; deduplicated: boolean } | Referral>("/referrals", {
      method: "POST",
      data: input
    }),
  myReferrals: () => apiRequest<Paginated<Referral> | Referral[]>("/referrals/me"),
  myRewards: () => apiRequest<Paginated<Reward> | Reward[]>("/referral-rewards/me"),
  createReferralShare: (jobDemandId: string) =>
    apiRequest<{ token: string; jobDemandId: string; expiresAt: string; path: string }>("/referrals/share-token", {
      method: "POST",
      data: { jobDemandId }
    }),
  resolveReferralShare: (token: string) =>
    apiRequest<{ token: string; jobDemandId: string }>(`/public/referral-shares/${encodeURIComponent(token)}`, { authenticated: false }),
  mySalarySlips: () => apiRequest<Paginated<SalarySlip> | SalarySlip[]>("/salary-slips/me"),
  blacklistRecords: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<BlacklistRecord>>(`/blacklist-records${queryString({ page: 1, pageSize: 100, ...params })}`),
  createBlacklistRecord: (input: Partial<BlacklistRecord>) =>
    apiRequest<BlacklistRecord>("/blacklist-records", { method: "POST", data: input }),
  appeals: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<AppealRecord>>(`/appeals${queryString({ page: 1, pageSize: 100, ...params })}`),
  createAppeal: (input: Partial<AppealRecord>) =>
    apiRequest<AppealRecord>("/appeals", { method: "POST", data: input }),
  advanceRequests: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<AdvanceRequest>>(`/advance-requests${queryString({ page: 1, pageSize: 100, ...params })}`),
  createAdvanceRequest: (input: Partial<AdvanceRequest>) =>
    apiRequest<AdvanceRequest>("/advance-requests", { method: "POST", data: input }),
  electronicContracts: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<ElectronicContract>>(`/electronic-contracts${queryString({ page: 1, pageSize: 100, ...params })}`),
  uploadContractMaterial: (id: string, materialName: string) =>
    apiRequest<ElectronicContract>(`/electronic-contracts/${encodeURIComponent(id)}/materials`, { method: "POST", data: { materialName } }),
  signElectronicContract: (id: string) =>
    apiRequest<ElectronicContract>(`/electronic-contracts/${encodeURIComponent(id)}/sign`, { method: "POST", data: {} }),
  policies: (params: Record<string, unknown> = {}) =>
    apiRequest<Paginated<Policy>>(`/policies${queryString({ page: 1, pageSize: 100, ...params })}`),
  overview: () => apiRequest<OverviewStatistics>("/statistics/overview")
};

async function collectAll<T>(fetchPage: (page: number) => Promise<Paginated<T>>): Promise<Paginated<T>> {
  const first = await fetchPage(1);
  if (first.pagination.totalPages <= 1) return first;
  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => fetchPage(index + 2))
  );
  return {
    items: first.items.concat(...remaining.map((page) => page.items)),
    pagination: {
      page: 1,
      pageSize: first.pagination.total,
      total: first.pagination.total,
      totalPages: 1
    }
  };
}

export function allProjects(params: Record<string, unknown> = {}): Promise<Paginated<Project>> {
  return collectAll((page) => api.projects({ ...params, page, pageSize: 200 }));
}

export function allJobs(params: Record<string, unknown> = {}): Promise<Paginated<JobDemand>> {
  return collectAll((page) => api.jobs({ ...params, page, pageSize: 200 }));
}

export function allPublicJobs(params: Record<string, unknown> = {}): Promise<Paginated<JobDemand>> {
  return collectAll((page) => api.publicJobs({ ...params, page, pageSize: 200 }));
}

export function itemsOf<T>(value: Paginated<T> | T[]): T[] {
  return Array.isArray(value) ? value : value.items;
}
