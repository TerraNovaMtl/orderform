import { db } from "./db";
import { getOrder } from "./repository";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function deliverEmails() {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.ORDER_EMAIL
  )
    return { sent: 0, configured: false };
  if (process.env.VERCEL_ENV !== "production" && !process.env.EMAIL_TEST_TO)
    return { sent: 0, configured: true, previewSuppressed: true };
  const jobs = await db().begin(async (tx) => {
    // Do not blindly replay ambiguous deliveries beyond the provider's 24h idempotency window.
    await tx`update terranova.email_outbox set state='failed',last_error='Delivery requires review; retry window expired' where state in ('pending','sending') and first_attempt_at<now()-interval '23 hours'`;
    return tx`update terranova.email_outbox set state='sending', locked_at=now(), attempts=attempts+1 where id in (select id from terranova.email_outbox where (state='pending' or (state='sending' and locked_at<now()-interval '10 minutes')) and available_at<=now() and attempts<6 order by created_at for update skip locked limit 10) returning *`;
  });
  let sent = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const o = await getOrder(job.order_id);
        const html = `<h1>Terra Nova order ${esc(o.reference)}</h1><p>${esc(o.company)} · ${esc(o.agentName)}<br>Store ${esc(o.storeCode)} · ${esc(o.contactName)}</p><table><thead><tr><th>Product</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${o.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty} ${esc(l.orderUnit)}</td><td>$${l.lineDealer.toFixed(2)}</td></tr>`).join("")}</tbody></table><p><strong>Total: $${o.totalDealer.toFixed(2)}</strong></p><p>${esc(o.comments)}</p>`;
        const payload = job.delivery_payload || {
          from: process.env.EMAIL_FROM,
          to: [
            process.env.VERCEL_ENV === "production"
              ? job.recipient
              : process.env.EMAIL_TEST_TO,
          ],
          subject: `Terra Nova order — ${o.reference}`,
          html,
        };
        if (!job.delivery_payload)
          await db()`update terranova.email_outbox set delivery_payload=${db().json(payload)},first_attempt_at=now() where id=${job.id}`;
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `order-email/${job.id}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) throw new Error(`Email provider HTTP ${result.status}`);
        const receipt = await result.json();
        await db()`update terranova.email_outbox set state='sent',provider_id=${receipt.id},last_error=null where id=${job.id}`;
        sent++;
      } catch {
        await db()`update terranova.email_outbox set state=${job.attempts >= 6 ? "failed" : "pending"}, available_at=now()+interval '10 minutes',last_error='Email delivery failed; inspect provider delivery log' where id=${job.id}`;
      }
    }),
  );
  await db()`delete from terranova.rate_limits where expires_at<now()-interval '1 day'`;
  return { sent, processed: jobs.length, configured: true };
}
