import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import reimbursementAssistantRoutes from "../src/routes/reimbursements-assistant.js";

describe("zero friction routes", () => {
  it("exposes /zero-friction endpoint", async () => {
    const app = Fastify();
    app.decorate("authenticate", async (request, reply) => {});
    await app.register(reimbursementAssistantRoutes, { prefix: "/api/reimbursements/assistant" });

    const response = await app.inject({
      method: "POST",
      url: "/api/reimbursements/assistant/zero-friction",
      payload: {
        lines: [
          { id: "L1", sequence: 1, paymentAmount: "100.5" }
        ],
        attachments: []
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.lines[0].paymentCents).toBe(10050);
    expect(body.data.lines[0].invoiceCents).toBe(10050);
    expect(body.data.prompts.some(p => p.includes("发票金额未填"))).toBe(true);
  });
});
