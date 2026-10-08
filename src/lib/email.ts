import nodemailer from "nodemailer";
import { db } from "./db";
import { getOrder } from "./repository";
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
function gmail() {
  return (transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  }));
}
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
    !process.env.GMAIL_USER ||
    !process.env.GMAIL_APP_PASSWORD ||
    !process.env.ORDER_EMAIL
  )
    return { sent: 0, configured: false };
  if (process.env.VERCEL_ENV !== "production" && !process.env.EMAIL_TEST_TO)
    return { sent: 0, configured: true, previewSuppressed: true };
  const jobs = await db().begin(async (tx) => {
    // Do not replay ambiguous deliveries more than a day old; SMTP has no provider-side deduplication.
    await tx`update terranova.email_outbox set state='failed',last_error='Delivery requires review; retry window expired' where state in ('pending','sending') and first_attempt_at<now()-interval '23 hours'`;
    return tx`update terranova.email_outbox set state='sending', locked_at=now(), attempts=attempts+1 where id in (select id from terranova.email_outbox where (state='pending' or (state='sending' and locked_at<now()-interval '10 minutes')) and available_at<=now() and attempts<6 order by created_at for update skip locked limit 10) returning *`;
  });
  let sent = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const o = await getOrder(job.order_id);
        const html = `<h1>Terra Nova order ${esc(o.reference)}</h1><p>${esc(o.company)} · ${esc(o.agentName)}<br>Store ${esc(o.storeCode)} · ${esc(o.contactName)}</p><table><thead><tr><th>Product</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${o.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty} ${esc(l.orderUnit)}</td><td>$${l.lineDealer.toFixed(2)}</td></tr>`).join("")}</tbody></table><p><strong>Total: $${o.totalDealer.toFixed(2)}</strong></p><p>PO: ${esc(o.customerPo || "")}<br>Phone: ${esc(o.contactPhone || "")}</p><p>${esc(o.comments)}</p>`;
        const payload = job.delivery_payload || {
          from: { name: "Terra Nova", address: process.env.GMAIL_USER },
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
        const info = await gmail().sendMail({
          ...payload,
          // Stable ID lets mail clients collapse a retried duplicate.
          messageId: `<order-email-${job.id}@terranova.orderform>`,
        });
        await db()`update terranova.email_outbox set state='sent',provider_id=${info.messageId},last_error=null where id=${job.id}`;
        sent++;
      } catch {
        await db()`update terranova.email_outbox set state=${job.attempts >= 6 ? "failed" : "pending"}, available_at=now()+interval '10 minutes',last_error='Email delivery failed; check the Gmail account and app password' where id=${job.id}`;
      }
    }),
  );
  await db()`delete from terranova.rate_limits where expires_at<now()-interval '1 day'`;
  return { sent, processed: jobs.length, configured: true };
}
