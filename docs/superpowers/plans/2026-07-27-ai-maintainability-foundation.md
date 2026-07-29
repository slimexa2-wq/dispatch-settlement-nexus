# AI Maintainability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a low-risk maintainability layer that lets developers and AI locate, understand, verify, and modify one HRMS business module without rescanning the entire repository.

**Architecture:** Keep the existing pnpm modular monolith and add a machine-readable module registry over the current file layout. Node.js scripts generate stable architecture indexes, validate module boundaries, report oversized files, and build task-specific AI context packs. Business behavior and deployment topology remain unchanged.

**Tech Stack:** Node.js 22 built-in modules, JSON, Markdown, existing pnpm monorepo, React, Fastify, Prisma, Taro.

## Global Constraints

- Do not move existing production source files in this phase.
- Do not change database behavior, business workflows, UI appearance, API contracts, permissions, or deployment topology.
- Internal organization remains `集团 → 中心 → 业务部门`; contract legal entity remains independent; project `Branch` remains a project-operation concept.
- Tooling must run with Node.js alone and must not require installed workspace dependencies.
- Generated files must be deterministic and checkable in CI.
- Large-file findings are warnings in this phase, not build failures.

---

### Task 1: Machine-readable module registry and validation core

**Files:**
- Create: `config/project-modules.json`
- Create: `scripts/project-tools/core.mjs`
- Create: `scripts/project-tools/core.test.mjs`

**Interfaces:**
- Produces: `loadModuleRegistry(rootDir)`, `validateModuleRegistry(registry, rootDir)`, `listProjectFiles(rootDir)`, `matchPath(pattern, filePath)`, `filesForModule(module, files)`.
- Registry fields: `version`, `modules[].id`, `name`, `description`, `include`, `dependsOn`, `businessRules`, `testCommands`, `prismaModels`.

- [ ] Write built-in Node tests proving wildcard matching, unknown dependencies, unmatched include patterns, duplicate IDs, and module file selection.
- [ ] Run `node --test scripts/project-tools/core.test.mjs` and confirm failure because the core module does not exist.
- [ ] Implement the core functions with no external packages.
- [ ] Run the same tests and confirm they pass.
- [ ] Commit registry and validation core.

### Task 2: Deterministic project index generator

**Files:**
- Create: `scripts/generate-project-index.mjs`
- Create: `scripts/project-tools/index-generator.test.mjs`
- Generate: `docs/generated/project-summary.md`
- Generate: `docs/generated/module-index.md`
- Generate: `docs/generated/api-route-index.md`
- Generate: `docs/generated/page-route-index.md`
- Generate: `docs/generated/prisma-index.md`
- Generate: `docs/generated/large-files-report.md`
- Generate: `docs/generated/project-index.json`

**Interfaces:**
- CLI: `node scripts/generate-project-index.mjs [--check]`.
- `--check` exits non-zero when committed generated files differ from current repository state.
- Uses registry and file helpers from Task 1.

- [ ] Write fixture-based tests for deterministic output, API route extraction, Taro page extraction, Prisma model extraction, and stale-index detection.
- [ ] Run the test and confirm failure because the generator module does not exist.
- [ ] Implement index collection and Markdown/JSON rendering.
- [ ] Generate the committed indexes.
- [ ] Run tests and `node scripts/generate-project-index.mjs --check`.
- [ ] Commit generator and generated indexes.

### Task 3: AI context pack builder

**Files:**
- Create: `scripts/build-ai-context.mjs`
- Create: `scripts/project-tools/context-builder.test.mjs`
- Generate on demand: `docs/generated/context/<module>-context.md`

**Interfaces:**
- CLI: `node scripts/build-ai-context.mjs <module-id> [--output <path>]`.
- Context pack includes module purpose, dependencies, business rules, relevant Prisma models, owned files ordered by reading priority, test commands, oversized-file warnings, and explicit out-of-scope modules.

- [ ] Write tests for valid context generation, dependency inclusion, stable file order, and unknown module errors.
- [ ] Run the test and confirm failure because the context builder does not exist.
- [ ] Implement context collection and rendering using Task 1 and Task 2 interfaces.
- [ ] Generate sample packs for `reimbursement` and `organization`.
- [ ] Run tests and confirm generated packs contain no source secrets or binary files.
- [ ] Commit the context builder and sample packs.

### Task 4: Human-facing architecture and module documentation

**Files:**
- Create: `AI_PROJECT_MAP.md`
- Create: `docs/modules/README.md`
- Create: `docs/modules/<module-id>/MODULE.md` for every registry module.
- Create: `docs/business-rules/authorization.md`
- Create: `docs/business-rules/organization.md`
- Create: `docs/business-rules/reimbursement.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`

**Interfaces:**
- Every `MODULE.md` states ownership, non-ownership, dependencies, entry points, database models, permissions, tests, and safe modification rules.
- `AI_PROJECT_MAP.md` is the mandatory first read for AI maintenance tasks.

- [ ] Document the current modular-monolith architecture without claiming physical module isolation that does not yet exist.
- [ ] Correct stale organization wording so internal hierarchy is group, center, business department; legal entity is independent; project Branch remains separate.
- [ ] Add a standard maintenance workflow that uses module context packs and affected-file constraints.
- [ ] Run registry validation to ensure all referenced docs exist.
- [ ] Commit documentation.

### Task 5: Root commands, architecture checks, and final verification

**Files:**
- Create: `scripts/check-architecture.mjs`
- Create: `scripts/project-tools/architecture-check.test.mjs`
- Modify: `package.json`
- Create: `docs/generated/maintenance-baseline.md`

**Interfaces:**
- Root commands: `project:index`, `project:index:check`, `project:check`, `project:context`, `project:verify`, plus module-focused test aliases for authorization, organization, and reimbursement.
- `project:check` fails on invalid registry, missing docs, unmatched module paths, dependency cycles, or generated-index drift; oversized files remain warnings.

- [ ] Write tests for dependency cycles, missing module docs, stale generated outputs, and oversized-file warnings.
- [ ] Run tests and confirm failure before implementation.
- [ ] Implement architecture checks and root scripts.
- [ ] Run all built-in Node tests, registry validation, index freshness check, context generation, and Git whitespace checks.
- [ ] Attempt existing pnpm tests/build and report environment blockers separately from code failures.
- [ ] Commit final maintainability foundation.
