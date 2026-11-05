import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  EmploymentStatus,
  InsuranceType,
  InterviewStatus,
  Permission,
  UserRole,
  idSchema,
  interviewUpdateSchema,
  offboardingSchema,
  onboardingSchema,
  personRegistrationSchema
} from "@xiangneng/shared";
import { andWhere, personWhere } from "../data-scope.js";
import { AppError, conflict, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { registerPerson } from "../services/registration.js";
import { writeAudit } from "../audit.js";
import { createKeyNotifications } from "../notifications.js";
import { chinaDayBounds } from "../dates.js";
import { personAnomalyValues, personAnomalyWhere, personMetricValues, personMetricWhere } from "../statistics-scope.js";
import { csvCell } from "../services/spreadsheet-safety.js";
import { offboardPerson, onboardPerson } from "../services/person-lifecycle.js";

const peopleQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  keyword: z.string().trim().max(100).optional(),
  branchId: idSchema.optional(),
  projectId: idSchema.optional(),
  supplierId: idSchema.optional(),
  recommenderUserId: idSchema.optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
  interviewStatus: z.nativeEnum(InterviewStatus).optional(),
  insurance: z.nativeEnum(InsuranceType).optional(),
  interviewDate: z.coerce.date().optional(),
  metric: z.enum(personMetricValues).optional(),
  anomalyId: z.enum(personAnomalyValues).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

const notesSchema = z.object({ notes: z.string().trim().max(2000).nullable() });

const personInclude = {
  project: { include: { branch: { select: { id: true, name: true } } } },
  supplier: { select: { id: true, name: true, level: true } },
  recommender: { select: { id: true, displayName: true } },
  supplierPolicy: { select: { id: true, name: true, version: true } }
};

function scopedPerson<T extends Record<string, unknown>>(person: T): T { return person; }

export async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/people", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_READ)]
  }, async (request) => {
    const query = peopleQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const interviewRange = query.interviewDate ? chinaDayBounds(query.interviewDate) : null;
    const createdFrom = query.from ? chinaDayBounds(query.from).start : undefined;
    const createdTo = query.to ? chinaDayBounds(query.to).end : undefined;
    const search = query.keyword
      ? {
          OR: [
            { name: { contains: query.keyword, mode: "insensitive" as const } },
            { idCard: { contains: query.keyword, mode: "insensitive" as const } },
            { phone: { contains: query.keyword } }
          ]
        }
      : {};
    const where = andWhere(
      personWhere(user),
      query.metric ? personMetricWhere(query.metric) : {},
      query.anomalyId ? personAnomalyWhere(query.anomalyId) : {},
      search,
      {
      projectId: query.projectId,
      project: query.branchId ? { branchId: query.branchId } : undefined,
      supplierId: query.supplierId,
      recommenderUserId: query.recommenderUserId,
      status: query.status,
      interviewStatus: query.interviewStatus,
      interviewDate: interviewRange ? { gte: interviewRange.start, lt: interviewRange.end } : undefined,
      insuranceTypes: query.insurance ? { array_contains: [query.insurance] } : undefined,
      createdAt: createdFrom || createdTo ? { gte: createdFrom, lt: createdTo } : undefined
      }
    );
    const [items, total] = await app.prisma.$transaction([
      app.prisma.person.findMany({ where, include: personInclude, orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
      app.prisma.person.count({ where })
    ]);
    return success(request, {
      items: items.map((item) => scopedPerson(item)),
      pagination: paginationMeta(page, pageSize, total)
    });
  });

  app.get("/people/export", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_EXPORT)]
  }, async (request, reply) => {
    const query = peopleQuerySchema.parse(request.query);
    const user = getSession(request);
    const interviewRange = query.interviewDate ? chinaDayBounds(query.interviewDate) : null;
    const createdFrom = query.from ? chinaDayBounds(query.from).start : undefined;
    const createdTo = query.to ? chinaDayBounds(query.to).end : undefined;
    const search = query.keyword ? {
      OR: [
        { name: { contains: query.keyword, mode: "insensitive" as const } },
        { idCard: { contains: query.keyword, mode: "insensitive" as const } },
        { phone: { contains: query.keyword } }
      ]
    } : {};
    const items = await app.prisma.person.findMany({
      where: andWhere(personWhere(user), query.metric ? personMetricWhere(query.metric) : {}, query.anomalyId ? personAnomalyWhere(query.anomalyId) : {}, search, {
        projectId: query.projectId,
        project: query.branchId ? { branchId: query.branchId } : undefined,
        supplierId: query.supplierId,
        recommenderUserId: query.recommenderUserId,
        status: query.status,
        interviewStatus: query.interviewStatus,
        insuranceTypes: query.insurance ? { array_contains: [query.insurance] } : undefined,
        interviewDate: interviewRange ? { gte: interviewRange.start, lt: interviewRange.end } : undefined,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lt: createdTo } : undefined
      }),
      include: {
        project: { select: { name: true, branch: { select: { name: true } } } },
        supplier: { select: { name: true } },
        recommender: { select: { displayName: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 10000
    });
    const header = ["姓名", "身份证号", "手机号", "分子公司", "项目", "岗位", "状态", "面试状态", "面试日期", "入职日期", "离职日期", "供应商", "推荐人", "保险", "备注"];
    const rows = items.map((person) => [
      person.name,
      person.idCard,
      person.phone,
      person.project.branch.name,
      person.project.name,
      person.jobTitle,
      person.status,
      person.interviewStatus,
      person.interviewDate?.toISOString().slice(0, 10),
      person.onboardDate?.toISOString().slice(0, 10),
      person.offboardDate?.toISOString().slice(0, 10),
      person.supplier?.name,
      person.recommender?.displayName,
      Array.isArray(person.insuranceTypes) ? person.insuranceTypes.join("、") : "",
      person.notes
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent("人员花名册.csv")}`)
      .send(csv);
  });

  app.get("/people/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_READ)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const person = await app.prisma.person.findFirst({
      where: andWhere(personWhere(user), { id }),
      include: {
        ...personInclude,
        files: { orderBy: { createdAt: "desc" } },
        statusLogs: { orderBy: { createdAt: "desc" }, take: 100 },
        applications: {
          include: { jobDemand: { select: { id: true, title: true, projectId: true, status: true } } },
          orderBy: { appliedAt: "desc" }
        }
      }
    });
    if (!person) notFound("人员档案");
    if (user.role === UserRole.SUPPLIER) {
      const { files: _files, statusLogs: _logs, ...safe } = person;
      return success(request, scopedPerson(safe));
    }
    return success(request, person);
  });

  app.post("/people", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request, reply) => {
    const input = personRegistrationSchema.parse(request.body);
    const result = await registerPerson(app.prisma, app.config, request, input, getSession(request));
    return reply.status(result.deduplicated ? 200 : 201).send(success(request, result));
  });

  app.patch("/people/:id/interview", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = interviewUpdateSchema.parse(request.body);
    const user = getSession(request);
    const existing = await app.prisma.person.findFirst({ where: andWhere(personWhere(user), { id }) });
    if (!existing) notFound("人员档案");
    if (existing.status === EmploymentStatus.ACTIVE || existing.status === EmploymentStatus.LEFT) {
      conflict("在职或已离职人员不能再修改面试状态");
    }
    const nextEmployment = input.status === InterviewStatus.PENDING_ARRIVAL || input.status === InterviewStatus.ARRIVED
      ? EmploymentStatus.INTERVIEWING
      : input.status === InterviewStatus.PASSED
        ? EmploymentStatus.PENDING_ONBOARD
        : EmploymentStatus.APPLICANT;
    const person = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.person.update({
        where: { id },
        data: { interviewStatus: input.status, status: nextEmployment, notes: input.notes ?? undefined }
      });
      await tx.personStatusLog.create({
        data: {
          personId: id,
          fromStatus: existing.status,
          toStatus: nextEmployment,
          interviewStatus: input.status,
          action: "INTERVIEW_UPDATED",
          notes: input.notes,
          actorId: user.id
        }
      });
      const currentApplication = await tx.application.findFirst({ where: { personId: id }, orderBy: { appliedAt: "desc" } });
      if (currentApplication) {
        await tx.application.update({
          where: { id: currentApplication.id },
          data: { interviewStatus: input.status, employmentStatus: nextEmployment }
        });
      }
      await writeAudit(tx, request, {
        action: "PERSON_INTERVIEW_UPDATE",
        resourceType: "Person",
        resourceId: id,
        before: { status: existing.status, interviewStatus: existing.interviewStatus },
        after: { status: nextEmployment, interviewStatus: input.status }
      });
      await createKeyNotifications(tx, app.config, {
        personId: id,
        supplierId: existing.supplierId,
        recommenderUserId: existing.recommenderUserId,
        type: "INTERVIEW_STATUS_CHANGED",
        title: "面试状态更新",
        content: `${existing.name}的面试状态已更新为 ${input.status}`,
        targetPath: `/pages/operator/person-detail/index?id=${id}`,
        dedupeKey: `INTERVIEW_STATUS_CHANGED:${id}:${input.status}`
      });
      return updated;
    });
    return success(request, person);
  });

  app.patch("/people/:id/onboard", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = onboardingSchema.parse(request.body);
    const user = getSession(request);
    const person = await app.prisma.$transaction((tx) => onboardPerson(tx, app.config, request, user, id, input));
    return success(request, person);
  });

  app.patch("/people/:id/offboard", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = offboardingSchema.parse(request.body);
    const user = getSession(request);
    const person = await app.prisma.$transaction((tx) => offboardPerson(tx, app.config, request, user, id, input));
    return success(request, person);
  });

  app.patch("/people/:id/notes", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = notesSchema.parse(request.body);
    const user = getSession(request);
    const existing = await app.prisma.person.findFirst({ where: andWhere(personWhere(user), { id }) });
    if (!existing) notFound("人员档案");
    const person = await app.prisma.person.update({ where: { id }, data: input });
    await writeAudit(app.prisma, request, {
      action: "PERSON_NOTES_UPDATE",
      resourceType: "Person",
      resourceId: id,
      before: { notes: existing.notes },
      after: { notes: person.notes }
    });
    return success(request, person);
  });

  app.post("/people/:id/files", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_WRITE)]
  }, async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const person = await app.prisma.person.findFirst({ where: andWhere(personWhere(user), { id }), select: { id: true } });
    if (!person) notFound("人员档案");
    const upload = await request.file();
    if (!upload) throw new AppError(400, "FILE_REQUIRED", "请选择附件");
    const saved = await app.fileStore.save({ stream: upload.file, filename: upload.filename, mimeType: upload.mimetype });
    const file = await app.prisma.personFile.create({ data: { personId: id, uploadedById: user.id, ...saved } });
    await writeAudit(app.prisma, request, {
      action: "PERSON_FILE_CREATE",
      resourceType: "PersonFile",
      resourceId: file.id,
      after: { personId: id, originalName: file.originalName, sizeBytes: file.sizeBytes }
    });
    return reply.status(201).send(success(request, file));
  });

  app.get("/people/:id/files/:fileId", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PEOPLE_READ)]
  }, async (request, reply) => {
    const { id, fileId } = z.object({ id: idSchema, fileId: idSchema }).parse(request.params);
    const user = getSession(request);
    if (user.role === UserRole.SUPPLIER) throw new AppError(403, "FORBIDDEN", "供应商不能查看人员附件");
    const file = await app.prisma.personFile.findFirst({
      where: { id: fileId, personId: id, person: personWhere(user) }
    });
    if (!file) notFound("人员附件");
    return reply
      .type(file.mimeType)
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`)
      .send(await app.fileStore.open(file.storageKey));
  });
}
