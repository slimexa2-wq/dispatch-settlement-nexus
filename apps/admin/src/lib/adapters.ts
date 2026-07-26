import type {
  Application,
  JobDemand,
  ListResult,
  Person,
  Project,
  ReferralReward,
  Supplier
} from "../types/domain";
import { listResult } from "./format";

type ListLike<T> = T[] | ListResult<T> | { rows?: T[]; total?: number };

export function mapList<TInput, TOutput>(
  value: ListLike<TInput>,
  mapper: (item: TInput) => TOutput,
  page = 1,
  pageSize = 20
): ListResult<TOutput> {
  const normalized = listResult(value, page, pageSize);
  return { ...normalized, items: normalized.items.map(mapper) };
}

export function adaptProject(project: Project): Project {
  const statistics = project.statistics;
  return {
    ...project,
    images: project.images?.map((image) => ({
      ...image,
      fileName: image.fileName ?? image.originalName,
      remark: image.remark ?? image.note
    })),
    activeCount: project.activeCount ?? statistics?.activeCount,
    onboardCount: project.onboardCount ?? statistics?.periodOnboard,
    offboardCount: project.offboardCount ?? statistics?.periodOffboard,
    interviewCount: project.interviewCount ?? statistics?.interviewCount
  };
}

export function adaptSupplier(supplier: Supplier): Supplier {
  const statistics = supplier.statistics;
  return {
    ...supplier,
    projects: supplier.projects ?? supplier.projectLinks?.map((link) => link.project),
    projectIds: supplier.projectIds ?? supplier.projectLinks?.map((link) => link.project.id),
    applicationCount: supplier.applicationCount ?? statistics?.registered ?? supplier._count?.people,
    arrivedCount: supplier.arrivedCount ?? statistics?.arrived,
    passedCount: supplier.passedCount ?? statistics?.passed,
    onboardCount: supplier.onboardCount ?? statistics?.onboarded,
    activeCount: supplier.activeCount ?? statistics?.active,
    offboardCount: supplier.offboardCount ?? statistics?.left
  };
}

export function adaptPerson(person: Person): Person {
  return {
    ...person,
    employmentStatus: person.employmentStatus ?? person.status!,
    files: person.files?.map((file) => ({
      ...file,
      fileName: file.fileName ?? file.originalName ?? "未命名附件"
    }))
  };
}

export function adaptJobDemand(job: JobDemand): JobDemand {
  const progress = job.progress;
  return {
    ...job,
    project: job.project ? adaptProject(job.project) : job.project,
    applicationCount: job.applicationCount ?? progress?.registered,
    arrivedCount: job.arrivedCount ?? progress?.arrived,
    passedCount: job.passedCount ?? progress?.passed,
    onboardCount: job.onboardCount ?? progress?.onboarded,
    remainingCount: job.remainingCount ?? progress?.remainingGap
  };
}

export function adaptApplication(application: Application): Application {
  const person = application.person
    ? adaptPerson({
        ...application.person,
        supplier: application.person.supplier ?? application.supplier,
        recommender: application.person.recommender ?? application.recommender
      })
    : application.person;
  return {
    ...application,
    person,
    createdAt: application.createdAt ?? application.appliedAt ?? ""
  };
}

export function adaptReward(reward: ReferralReward): ReferralReward {
  const jobDemand = reward.referral?.jobDemand;
  const person = reward.person ?? reward.referral?.person;
  return {
    ...reward,
    person: person
      ? adaptPerson({
          ...person,
          project: person.project ?? jobDemand?.project,
          projectName: person.projectName ?? jobDemand?.project?.name
        })
      : person,
    recommender: reward.recommender ?? reward.referral?.recommender
  };
}
