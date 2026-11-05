import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  JobStatus,
  Permission,
  ProjectStatus,
  UserRole,
  idSchema,
  projectSchema
} from "@xiangneng/shared";
import { projectWhere, andWhere } from "../data-scope.js";
import { AppError, notFound } from "../errors.js";
import { paginationMeta, parsePagination, success } from "../http.js";
import { getSession } from "../plugins/auth.js";
import { writeAudit } from "../audit.js";
import { chinaMonthBounds } from "../dates.js";

const projectQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  branchId: idSchema.optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  isExternal: z.enum(["true", "false"]).optional(),
  keyword: z.string().trim().max(200).optional()
});

const imageMetaSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).default(0),
  note: z.string().trim().max(500).optional().nullable()
});

function multipartFieldValue(field: unknown): unknown {
  if (!field || Array.isArray(field) || typeof field !== "object" || !("value" in field)) return undefined;
  return (field as { value: unknown }).value;
}

const projectInclude = {
  branch: { select: { id: true, name: true } },
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  _count: { select: { people: true, jobDemands: true } }
};

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/branches", { preHandler: [app.authenticate] }, async (request) => {
    const user = getSession(request);
    const items = await app.prisma.branch.findMany({
      where: user.role === UserRole.BRANCH_MANAGER ? { id: user.branchId ?? "" } : {},
      orderBy: { name: "asc" }
    });
    return success(request, items);
  });

  app.get("/projects", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_READ)]
  }, async (request) => {
    const query = projectQuerySchema.parse(request.query);
    const user = getSession(request);
    const { page, pageSize, skip } = parsePagination(query);
    const where = andWhere(projectWhere(user), {
      branchId: query.branchId,
      status: query.status,
      isExternal: query.isExternal === undefined ? undefined : query.isExternal === "true",
      name: query.keyword ? { contains: query.keyword, mode: "insensitive" as const } : undefined
    });
    const [items, total] = await app.prisma.$transaction([
      app.prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: { name: "asc" },
        skip,
        take: pageSize
      }),
      app.prisma.project.count({ where })
    ]);
    return success(request, { items, pagination: paginationMeta(page, pageSize, total) });
  });

  app.get("/projects/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_READ)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const project = await app.prisma.project.findFirst({
      where: andWhere(projectWhere(user), { id }),
      include: {
        ...projectInclude,
        people: {
          select: { id: true, name: true, status: true, jobTitle: true, onboardDate: true, offboardDate: true },
          orderBy: { updatedAt: "desc" },
          take: 50
        }
      }
    });
    if (!project) notFound("项目");
    const month = chinaMonthBounds();
    const [activeCount, periodOnboard, periodOffboard, interviewCount] = await Promise.all([
      app.prisma.person.count({ where: { projectId: id, status: "ACTIVE" } }),
      app.prisma.person.count({
        where: { projectId: id, onboardDate: { gte: month.start, lt: month.end } }
      }),
      app.prisma.person.count({
        where: { projectId: id, offboardDate: { gte: month.start, lt: month.end } }
      }),
      app.prisma.person.count({ where: { projectId: id, interviewDate: { not: null } } })
    ]);
    return success(request, { ...project, statistics: { activeCount, periodOnboard, periodOffboard, interviewCount } });
  });

  app.get("/projects/:id/images", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const allowedProject = user.permissions.includes(Permission.PROJECT_READ)
      ? projectWhere(user)
      : { jobDemands: { some: { status: JobStatus.RECRUITING } } };
    const project = await app.prisma.project.findFirst({
      where: andWhere(allowedProject, { id }),
      select: { id: true }
    });
    if (!project) notFound("项目");
    const items = await app.prisma.projectImage.findMany({
      where: { projectId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return success(request, items);
  });

  app.post("/projects", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_WRITE)]
  }, async (request, reply) => {
    const input = projectSchema.parse(request.body);
    const user = getSession(request);
    if (user.role === UserRole.BRANCH_MANAGER && input.branchId !== user.branchId) {
      throw new AppError(403, "OUT_OF_SCOPE", "不能在其他分子公司创建项目");
    }
    const project = await app.prisma.project.create({ data: input, include: projectInclude });
    await writeAudit(app.prisma, request, {
      action: "PROJECT_CREATE",
      resourceType: "Project",
      resourceId: project.id,
      after: { name: project.name, branchId: project.branchId, status: project.status }
    });
    return reply.status(201).send(success(request, project));
  });

  app.patch("/projects/:id", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_WRITE)]
  }, async (request) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = projectSchema.partial().parse(request.body);
    const user = getSession(request);
    const existing = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id }) });
    if (!existing) notFound("项目");
    if (user.role === UserRole.BRANCH_MANAGER && input.branchId && input.branchId !== user.branchId) {
      throw new AppError(403, "OUT_OF_SCOPE", "不能把项目转移到其他分子公司");
    }
    const project = await app.prisma.project.update({ where: { id }, data: input, include: projectInclude });
    await writeAudit(app.prisma, request, {
      action: "PROJECT_UPDATE",
      resourceType: "Project",
      resourceId: id,
      before: { name: existing.name, branchId: existing.branchId, status: existing.status },
      after: { name: project.name, branchId: project.branchId, status: project.status }
    });
    return success(request, project);
  });

  app.post("/projects/:id/images", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_WRITE)]
  }, async (request, reply) => {
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const user = getSession(request);
    const project = await app.prisma.project.findFirst({ where: andWhere(projectWhere(user), { id }), select: { id: true } });
    if (!project) notFound("项目");
    const file = await request.file();
    if (!file) throw new AppError(400, "FILE_REQUIRED", "请选择项目实拍图");
    if (!file.mimetype.startsWith("image/")) {
      throw new AppError(400, "IMAGE_REQUIRED", "项目实拍图必须是图片文件");
    }
    const meta = imageMetaSchema.parse({
      sortOrder: multipartFieldValue(file.fields.sortOrder),
      note: multipartFieldValue(file.fields.note)
    });
    const saved = await app.fileStore.save({ stream: file.file, filename: file.filename, mimeType: file.mimetype });
    const image = await app.prisma.projectImage.create({ data: { projectId: id, ...saved, ...meta } });
    await writeAudit(app.prisma, request, {
      action: "PROJECT_IMAGE_CREATE",
      resourceType: "ProjectImage",
      resourceId: image.id,
      after: { projectId: id, originalName: image.originalName, sortOrder: image.sortOrder }
    });
    return reply.status(201).send(success(request, image));
  });

  app.get("/project-images/:imageId/content", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { imageId } = z.object({ imageId: idSchema }).parse(request.params);
    const user = getSession(request);
    const image = await app.prisma.projectImage.findFirst({
      where: {
        id: imageId,
        project: user.permissions.includes(Permission.PROJECT_READ)
          ? projectWhere(user)
          : { jobDemands: { some: { status: JobStatus.RECRUITING } } }
      }
    });
    if (!image) notFound("项目图片");
    return reply.type(image.mimeType).header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(image.originalName)}`).send(await app.fileStore.open(image.storageKey));
  });

  app.get("/public/project-images/:imageId/content", async (request, reply) => {
    const { imageId } = z.object({ imageId: idSchema }).parse(request.params);
    const image = await app.prisma.projectImage.findFirst({
      where: {
        id: imageId,
        project: {
          jobDemands: {
            some: { status: JobStatus.RECRUITING, deadline: { gte: new Date() } }
          }
        }
      }
    });
    if (!image) notFound("项目图片");
    return reply.type(image.mimeType)
      .header("cache-control", "public, max-age=300")
      .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(image.originalName)}`)
      .send(await app.fileStore.open(image.storageKey));
  });

  app.delete("/projects/:id/images/:imageId", {
    preHandler: [app.authenticate, app.requirePermission(Permission.PROJECT_WRITE)]
  }, async (request) => {
    const { id, imageId } = z.object({ id: idSchema, imageId: idSchema }).parse(request.params);
    const user = getSession(request);
    const image = await app.prisma.projectImage.findFirst({
      where: { id: imageId, projectId: id, project: projectWhere(user) }
    });
    if (!image) notFound("项目图片");
    await app.prisma.projectImage.delete({ where: { id: imageId } });
    await app.fileStore.remove(image.storageKey);
    await writeAudit(app.prisma, request, {
      action: "PROJECT_IMAGE_DELETE",
      resourceType: "ProjectImage",
      resourceId: imageId,
      before: { projectId: id, originalName: image.originalName }
    });
    return success(request, { id: imageId, deleted: true });
  });
}
