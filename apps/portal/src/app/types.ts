export interface Session {
  personaId: string;
  name: string;
  role: 'personal' | 'group_leader' | 'company_manager' | 'project_manager' | 'site_operator' | 'supplier';
  subtitle: string;
  companyId?: string;
  projectIds?: string[];
  supplierId?: string;
  personId?: string;
  personStatus?: string;
}

export interface Job {
  id: string;
  project_id: string;
  projectName: string;
  companyName: string;
  title: string;
  type: string;
  salary_min: number;
  salary_max: number;
  headcount: number;
  work_time: string;
  requirements: string;
  duties: string;
  benefits: string;
  deadline: string;
  status: string;
  supplier_policy: string;
  referral_policy: string;
  policy_start: string;
  policy_end: string;
  settlement_condition: string;
  created_at: string;
  region: string;
  address: string;
  projectDescription: string;
  managerName: string;
  managerPhone: string;
  imageKey: string;
  imageUrl: string;
  appliedCount: number;
  completedCount: number;
}

export interface Person {
  id: string;
  name: string;
  phone: string;
  idCard: string;
  employeeNo?: string | null;
  gender?: string;
  age?: number;
  origin?: string;
  projectId: string;
  projectName: string;
  companyId?: string;
  jobId: string;
  jobTitle: string;
  supplierId?: string | null;
  supplierName?: string | null;
  recommenderName?: string | null;
  status: string;
  appliedAt: string;
  interviewAt?: string | null;
  onboardDate?: string | null;
  departureDate?: string | null;
  insuranceStatus?: string | null;
  employmentDays?: number;
  lifecycle?: Array<{ id: string; status: string; occurredAt: string; note?: string }>;
}

export interface MessageItem {
  id: string;
  type: string;
  title: string;
  content: string;
  targetPath: string;
  isRead: boolean | number;
  createdAt: string;
}
