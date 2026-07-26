import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { AppConfig } from "../config.js";
import type { AiSkill, ToolDefinition } from "./types.js";

type ToolSchemaFile = {
  tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
};

const skillDirectory: Record<AiSkill, string> = {
  project_personnel_statistics: "project-personnel-statistics",
  employee_information_query: "employee-information-query",
  recruitment_progress_query: "recruitment-progress-query",
  employee_entry: "employee-entry",
  employee_resignation: "employee-resignation"
};

export class AiSchemaRegistry {
  private readonly ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }));
  private intentValidator?: ValidateFunction;
  private readonly toolFiles = new Map<AiSkill, ToolSchemaFile>();
  private readonly toolValidators = new Map<string, ValidateFunction>();

  constructor(private readonly config: AppConfig) {}

  async load(): Promise<void> {
    const intentSchema = JSON.parse(await readFile(join(this.config.AI_SKILL_ROOT, "router", "intent-schema.json"), "utf8"));
    this.intentValidator = this.ajv.compile(intentSchema);
    for (const [skill, directory] of Object.entries(skillDirectory) as Array<[AiSkill, string]>) {
      const file = JSON.parse(await readFile(join(this.config.AI_SKILL_ROOT, "skills", directory, "tool-schema.json"), "utf8")) as ToolSchemaFile;
      this.toolFiles.set(skill, file);
      for (const tool of file.tools) {
        this.toolValidators.set(`${skill}:${tool.name}`, this.ajv.compile(tool.input_schema));
      }
    }
  }

  validateIntent(value: unknown): asserts value is Record<string, unknown> {
    if (!this.intentValidator?.(value)) {
      throw new Error(`意图 Schema 校验失败：${this.ajv.errorsText(this.intentValidator?.errors)}`);
    }
  }

  validateToolInput(skill: AiSkill, toolName: string, value: unknown): void {
    const validator = this.toolValidators.get(`${skill}:${toolName}`);
    if (!validator) throw new Error(`未注册工具 Schema：${skill}/${toolName}`);
    if (!validator(value)) throw new Error(`工具参数 Schema 校验失败：${this.ajv.errorsText(validator.errors)}`);
  }

  toolsFor(skills: AiSkill[], limit = 4): ToolDefinition[] {
    return skills.flatMap((skill) => (this.toolFiles.get(skill)?.tools ?? []).map((tool) => ({
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
    }))).slice(0, limit);
  }
}
