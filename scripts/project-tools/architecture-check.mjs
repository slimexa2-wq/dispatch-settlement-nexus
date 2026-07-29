import { validateModuleRegistry } from "./core.mjs";

export function detectDependencyCycles(registry) {
  const graph = new Map((registry.modules ?? []).map((module) => [module.id, module.dependsOn ?? []]));
  const state = new Map();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  function canonicalKey(cycle) {
    const body = cycle.slice(0, -1);
    const variants = body.map((_, index) => {
      const rotated = [...body.slice(index), ...body.slice(0, index)];
      return [...rotated, rotated[0]].join("->");
    });
    return variants.sort()[0];
  }

  function visit(id) {
    const currentState = state.get(id) ?? 0;
    if (currentState === 2) return;
    if (currentState === 1) {
      const start = stack.indexOf(id);
      if (start >= 0) {
        const cycle = [...stack.slice(start), id];
        const key = canonicalKey(cycle);
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(id, 2);
  }

  for (const id of [...graph.keys()].sort()) visit(id);
  return cycles.sort((left, right) => left.join("->").localeCompare(right.join("->"), "en"));
}

export function analyzeArchitecture({
  registry,
  projectFiles,
  existingFiles,
  generatedDifferences,
  largeFiles
}) {
  const errors = [];
  const warnings = [];
  const registryResult = validateModuleRegistry(registry, process.cwd(), projectFiles);
  errors.push(...registryResult.errors);

  for (const cycle of detectDependencyCycles(registry)) {
    errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  }

  for (const module of registry.modules ?? []) {
    const moduleDocument = `docs/modules/${module.id}/MODULE.md`;
    if (!existingFiles.has(moduleDocument)) {
      errors.push(`missing module document for ${module.id}: ${moduleDocument}`);
    }
    for (const businessRule of module.businessRules ?? []) {
      if (!existingFiles.has(businessRule)) {
        errors.push(`missing business rule document for ${module.id}: ${businessRule}`);
      }
    }
  }

  for (const file of generatedDifferences.missing ?? []) {
    errors.push(`missing generated index: ${file}`);
  }
  for (const file of generatedDifferences.stale ?? []) {
    errors.push(`stale generated index: ${file}`);
  }
  for (const file of generatedDifferences.extra ?? []) {
    warnings.push(`unregistered generated file: ${file}`);
  }

  for (const file of largeFiles ?? []) {
    warnings.push(`oversized source file: ${file.path} has ${file.lines} lines (recommended ${file.threshold})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
