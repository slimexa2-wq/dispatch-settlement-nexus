1. **Create reimbursement assistant service** (`apps/api/src/services/reimbursement-assistant.ts`):
   - Implement `processZeroFrictionReimbursement` which takes reimbursement lines and attachments as input.
   - It will convert `paymentAmount` and `invoiceAmount` (which could be strings or numbers) into cents (integers).
   - If `invoiceAmount` is empty, it will automatically populate it using `paymentAmount` and generate a prompt saying the invoice amount was auto-filled.
   - It will check if the invoice amount is less than the payment amount and generate a prompt if so.
   - It will deduplicate invoice attachments by checking their SHA-256 hashes against each other and a provided set of `existingInvoiceHashes`. Deduplicated invoices generate a prompt.

2. **Add zero-friction endpoint** to the API:
   - Create `apps/api/src/routes/reimbursements-assistant.ts` containing `reimbursementAssistantRoutes`.
   - The route will be `POST /zero-friction`.
   - It will parse the body using Zod and call `processZeroFrictionReimbursement`.

3. **Register the new routes** in `apps/api/src/app.ts`:
   - Import `reimbursementAssistantRoutes`.
   - Register it with prefix `/reimbursements/assistant`.

4. **Write unit tests**:
   - `apps/api/test/reimbursement-assistant.test.ts` for the service logic.
   - `apps/api/test/reimbursement-assistant-routes.test.ts` for the route.

5. **Complete pre-commit steps** to ensure proper testing, verification, review, and reflection are done.

6. **Submit PR**.
