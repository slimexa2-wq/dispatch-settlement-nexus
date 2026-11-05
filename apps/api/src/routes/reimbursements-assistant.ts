import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { processZeroFrictionReimbursement } from "../services/reimbursement-assistant.js";

const zeroFrictionBody = z.object({
  lines: z.array(z.object({
    id: z.string(),
    sequence: z.number().int().positive(),
    paymentAmount: z.union([z.string(), z.number()]),
    invoiceAmount: z.union([z.string(), z.number(), z.null()]).optional(),
  })),
  attachments: z.array(z.object({
    id: z.string(),
    type: z.enum(["PAYMENT_VOUCHER", "INVOICE", "SUPPORTING"]),
    sha256: z.string(),
  })),
  existingInvoiceHashes: z.array(z.string()).optional(),
});

export default async function reimbursementAssistantRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/zero-friction",
    {
      preHandler: [fastify.authenticate]
    },
    async (request) => {
      const input = zeroFrictionBody.parse(request.body);
      const result = processZeroFrictionReimbursement({
        ...input,
        existingInvoiceHashes: input.existingInvoiceHashes ? new Set(input.existingInvoiceHashes) : undefined,
      });

      return { data: result };
    }
  );
}
