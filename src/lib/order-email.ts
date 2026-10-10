import type { EmailThumbnail } from "./email-thumbnails";
import type { Order } from "./domain";

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export function renderOrderEmail(
  order: Order,
  thumbnails: EmailThumbnail[] = [],
  update?: { comments: string },
) {
  const thumbnailByLine = new Map(
    thumbnails.map((thumbnail) => [thumbnail.lineId, thumbnail]),
  );
  const productCell = (line: Order["lines"][number]) => {
    const thumbnail = thumbnailByLine.get(line.id);
    const label = `${esc(line.name)}${line.sku ? `<br><span style="font-size:11px;color:#697772;">SKU: ${esc(line.sku)}</span>` : ""}`;
    return thumbnail
      ? `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td valign="middle" style="padding:0 10px 0 0;border:0;"><img src="cid:${esc(thumbnail.cid)}" alt="${esc(line.name)}" width="${thumbnail.width}" height="${thumbnail.height}" style="display:block;width:${thumbnail.width}px;height:${thumbnail.height}px;border:1px solid #e4e8e5;"></td><td valign="middle" style="padding:0;border:0;">${label}</td></tr></table>`
      : label;
  };
  const cell = "border:1px solid #dce2de;padding:12px 14px;";
  const companyLogo =
    order.company.trim().toLowerCase() === "canadian tire"
      ? '<img src="cid:company-logo" alt="Canadian Tire" width="64" height="43" style="display:block;width:64px;height:43px;">'
      : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f7f6f2;font-family:Arial,sans-serif;color:#233e50;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dce2de;"><tr><td style="padding:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td valign="middle"><img src="cid:terra-nova-logo" alt="Terra Nova" width="190" height="63" style="display:block;width:190px;height:63px;"></td><td align="right" valign="middle">${companyLogo}</td></tr></table>
<h1 style="margin:22px 0 8px;font-size:22px;line-height:1.4;">${update ? "Order update" : "Order confirmation"}</h1>
<p style="margin:0 0 16px;font-size:13px;color:#697772;">${esc(order.reference)}<br>${esc(new Date(order.date).toLocaleString("en-CA", { timeZone: "America/Toronto" }))}</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 22px;">${esc(order.company)}<br><strong>Agent:</strong> ${esc(order.agentName)}<br><strong>Store:</strong> ${esc(order.storeCode)}<br><strong>Store contact:</strong> ${esc(order.contactName)}</p>
${update?.comments ? `<div style="margin:0 0 20px;padding:14px;background:#fff4e8;border-left:3px solid #d96835;font-size:14px;line-height:1.6;"><strong>Update comments</strong><br>${esc(update.comments).replace(/\r?\n/g, "<br>")}</div>` : ""}
<table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.5;">
<thead><tr style="background:#edf3f1;"><th align="left" style="${cell}font-weight:700;">Product</th><th align="center" style="${cell}width:90px;">Quantity</th><th align="right" style="${cell}width:110px;white-space:nowrap;">Line total</th></tr></thead>
<tbody>${order.lines.map((line) => `<tr><td style="${cell}">${productCell(line)}</td><td align="center" style="${cell}white-space:nowrap;">${line.qty} ${esc(line.orderUnit)}</td><td align="right" style="${cell}text-align:right;white-space:nowrap;">$${line.lineDealer.toFixed(2)}</td></tr>`).join("")}</tbody>
<tfoot><tr style="background:#f7f9f8;"><td colspan="2" style="${cell}font-size:16px;font-weight:700;">Dealer total</td><td align="right" style="${cell}text-align:right;font-size:24px;font-weight:700;white-space:nowrap;">$${order.totalDealer.toFixed(2)}</td></tr></tfoot></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;font-size:13px;line-height:1.6;"><tr><td style="padding-bottom:6px;"><strong>PO number:</strong> ${esc(order.customerPo || "—")}</td></tr><tr><td><strong>Phone:</strong> ${esc(order.contactPhone || "—")}</td></tr>${order.comments ? `<tr><td style="padding-top:14px;"><strong>Order notes</strong><br>${esc(order.comments).replace(/\r?\n/g, "<br>")}</td></tr>` : ""}</table>
</td></tr></table></body></html>`;
}
