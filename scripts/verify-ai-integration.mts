const baseUrl = process.env.XIANGNENG_VERIFY_API_URL ?? "http://127.0.0.1:3310/api";

type JsonRecord = Record<string, any>;

async function call(path: string, token?: string, init: RequestInit = {}): Promise<{ status: number; body: JsonRecord }> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { status: response.status, body: await response.json() as JsonRecord };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function demoLogin(persona: string): Promise<string> {
  const response = await call("/auth/demo-login", undefined, {
    method: "POST",
    body: JSON.stringify({ persona })
  });
  assert(response.status === 200 && response.body.data?.token, `Demo login failed for ${persona}`);
  return response.body.data.token as string;
}

async function chat(token: string, message: string): Promise<JsonRecord> {
  const response = await call("/ai/chat", token, {
    method: "POST",
    body: JSON.stringify({ message, parameters: {} })
  });
  assert(response.status === 200, `AI chat failed (${response.status}): ${JSON.stringify(response.body)}`);
  return response.body.data as JsonRecord;
}

const report: JsonRecord = { checks: [] };
const adminToken = await demoLogin("systemAdmin");

try {
  const health = await call("/ai/health", adminToken);
  assert(health.status === 200 && health.body.data?.database === "ok" && health.body.data?.model === "ok", "AI health is not fully ready");
  report.checks.push("health_database_model_rules");

  const readonlyCases = [
    ["project_personnel_statistics", "查询祥能智造示范项目本月入职、离职、当前在职和净增减"],
    ["employee_information_query", "查询手机号10000000004的完整人员信息"],
    ["recruitment_progress_query", "祥能智造示范项目招人的达成情况怎么样"]
  ] as const;
  for (const [expectedSkill, message] of readonlyCases) {
    const result = await chat(adminToken, message);
    assert(result.type === "query_result" && result.skill === expectedSkill, `Expected ${expectedSkill}, received ${result.skill}/${result.type}`);
    assert(result.result?.updated_at && (result.result?.rows || result.result?.employee || result.result?.candidates), `${expectedSkill} did not return live business data`);
  }
  report.checks.push("three_readonly_skills_live_data");

  const resignation = await chat(adminToken, "给手机号10000000004办理2026-07-26离职，原因是个人原因辞职");
  assert(resignation.type === "action_preview" && resignation.preview?.confirmation_required === true, "Resignation did not produce a confirmation preview");
  const resignationAction = resignation.preview as JsonRecord;
  const previewState = await call(`/ai/actions/${resignationAction.action_id}`, adminToken);
  assert(previewState.status === 200 && previewState.body.data?.status === "PREVIEWED", "Preview was not persisted as PREVIEWED");

  const invalidConfirm = await call("/ai/actions/confirm", adminToken, {
    method: "POST",
    body: JSON.stringify({ actionId: resignationAction.action_id, actionToken: `${resignationAction.action_token}invalid`, idempotencyKey: crypto.randomUUID() })
  });
  assert(invalidConfirm.status >= 400, "Invalid action token was accepted");

  const resignationKey = crypto.randomUUID();
  const resignationPayload = {
    actionId: resignationAction.action_id,
    actionToken: resignationAction.action_token,
    idempotencyKey: resignationKey
  };
  const resignationConfirmed = await call("/ai/actions/confirm", adminToken, { method: "POST", body: JSON.stringify(resignationPayload) });
  assert(resignationConfirmed.status === 200 && resignationConfirmed.body.data?.status === "EXECUTED", "Resignation confirmation failed");
  const resignedPerson = await chat(adminToken, "查询手机号10000000004的完整人员信息");
  assert(resignedPerson.result?.employee?.offboard_date === "2026-07-26", "Resignation business date changed after database persistence");
  const resignationRepeated = await call("/ai/actions/confirm", adminToken, { method: "POST", body: JSON.stringify(resignationPayload) });
  assert(resignationRepeated.status === 200 && resignationRepeated.body.data?.status === "EXECUTED", "Idempotent resignation replay failed");
  report.checks.push("resignation_preview_token_transaction_idempotency");

  const resetAfterResignation = await call("/ai/demo/reset", adminToken, { method: "POST", body: "{}" });
  assert(resetAfterResignation.status === 200 && resetAfterResignation.body.data?.restored_people >= 1, "Demo reset did not restore resignation data");

  const entry = await chat(adminToken, "给手机号10000000003办理2026-07-26入职");
  assert(entry.type === "action_preview" && entry.preview?.confirmation_required === true, "Entry did not produce a confirmation preview");
  const entryAction = entry.preview as JsonRecord;
  const entryKey = crypto.randomUUID();
  const entryPayload = { actionId: entryAction.action_id, actionToken: entryAction.action_token, idempotencyKey: entryKey };
  const entryConfirmed = await call("/ai/actions/confirm", adminToken, { method: "POST", body: JSON.stringify(entryPayload) });
  assert(entryConfirmed.status === 200 && entryConfirmed.body.data?.status === "EXECUTED", "Entry confirmation failed");
  const onboardedPerson = await chat(adminToken, "查询手机号10000000003的完整人员信息");
  assert(onboardedPerson.result?.employee?.onboard_date === "2026-07-26", "Entry business date changed after database persistence");
  const entryRepeated = await call("/ai/actions/confirm", adminToken, { method: "POST", body: JSON.stringify(entryPayload) });
  assert(entryRepeated.status === 200 && entryRepeated.body.data?.status === "EXECUTED", "Idempotent entry replay failed");
  report.checks.push("entry_preview_transaction_idempotency");

  const employeeToken = await demoLogin("employee");
  const deniedWrite = await call("/ai/chat", employeeToken, {
    method: "POST",
    body: JSON.stringify({ message: "给手机号10000000004办理2026-07-26离职，原因是个人原因辞职", parameters: {} })
  });
  assert(deniedWrite.status >= 400 || deniedWrite.body.data?.type !== "action_preview", "Employee role received an unauthorized write preview");
  report.checks.push("role_permission_denial");
} finally {
  const reset = await call("/ai/demo/reset", adminToken, { method: "POST", body: "{}" });
  report.final_reset = { status: reset.status, restored_people: reset.body.data?.restored_people ?? 0 };
}

report.status = "ok";
report.checked_at = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
