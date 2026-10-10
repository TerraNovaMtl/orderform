import nodemailer from "nodemailer";
import { resolve } from "node:path";
import { db } from "./db";
import { getOrder } from "./repository";
import { orderEmailThumbnails } from "./email-thumbnails";
import { renderOrderEmail } from "./order-email";
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
export async function deliverEmails() {
  const missing = ["GMAIL_USER", "GMAIL_APP_PASSWORD"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length) {
    console.error(
      "Email delivery disabled: missing environment variables",
      missing,
    );
    return { sent: 0, configured: false, missing };
  }
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
        const o = job.order_snapshot || (await getOrder(job.order_id));
        const thumbnails = job.delivery_payload
          ? []
          : await orderEmailThumbnails(o);
        const html = renderOrderEmail(
          o,
          thumbnails,
          job.email_kind === "update"
            ? { comments: job.email_comments }
            : undefined,
        );
        const [snapshot] =
          await db()`select agent_email from terranova.orders where id=${job.order_id}`;
        const agentEmail = snapshot?.agent_email?.trim().toLowerCase();
        const payload = job.delivery_payload || {
          from: { name: "Terra Nova", address: process.env.GMAIL_USER },
          to: [
            process.env.VERCEL_ENV === "production"
              ? job.recipient
              : process.env.EMAIL_TEST_TO,
          ],
          cc:
            process.env.VERCEL_ENV === "production" &&
            agentEmail &&
            agentEmail !== job.recipient.trim().toLowerCase()
              ? [agentEmail]
              : [],
          subject:
            job.email_kind === "update"
              ? `Order update — ${o.reference}`
              : `Terra Nova order — ${o.reference}`,
          html,
          thumbnails,
        };
        if (!job.delivery_payload)
          await db()`update terranova.email_outbox set delivery_payload=${db().json(payload)},first_attempt_at=now() where id=${job.id}`;
        const info = await gmail().sendMail({
          ...payload,
          attachments: [
            ...(payload.thumbnails ?? []).map(
              ({
                lineId: _lineId,
                width: _width,
                height: _height,
                ...attachment
              }: import("./email-thumbnails").EmailThumbnail) => attachment,
            ),
            ...(payload.html.includes("cid:terra-nova-logo")
              ? [
                  {
                    filename: "terra-nova-logo.png",
                    path: resolve("public/images/terra-nova-logo.png"),
                    cid: "terra-nova-logo",
                  },
                ]
              : []),
            ...(payload.html.includes("cid:company-logo")
              ? [
                  {
                    filename: "canadian-tire.png",
                    path: resolve("public/images/canadian-tire-clean.png"),
                    cid: "company-logo",
                  },
                ]
              : []),
          ],
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
