"use client";
import { LanguageToggle, useLanguage } from "./language";
import { useEffect, useRef } from "react";
import { csvCell, moneyFormat, type Order } from "@/lib/domain";
import { LocalInstanceBadge } from "./local-instance-badge";
export async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: res.status,
    });
  return data;
}
export function Brand({
  admin = false,
  company = "",
}: {
  admin?: boolean;
  company?: string;
}) {
  const { t } = useLanguage();
  return (
    <header className="brand-header">
      <a className="brand" href={admin ? "/admin" : "/"}>
        <img
          src="/images/terra-nova-logo.png"
          alt="Terra Nova"
          width={280}
          height={64}
          style={{
            width: "clamp(190px, 24vw, 280px)",
            height: 64,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
        <small>
          {admin ? "Wholesale administration" : t("Wholesale collection")}
        </small>
      </a>
      <LocalInstanceBadge />
      {!admin && <LanguageToggle />}
      {company.trim().toLowerCase() === "canadian tire" && (
        <img
          src="/images/canadian-tire-clean.png"
          alt="Canadian Tire"
          className="dealer-logo"
          width={84}
          height={64}
          style={{ width: 84, height: 64, objectFit: "contain", flexShrink: 0 }}
        />
      )}
      <span className="header-note">
        {t("Thoughtfully selected. Ready for your shelves.")}
      </span>
    </header>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Close dialog")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function exportOrder(order: Order) {
  const rows: unknown[][] = [
    ["Order", order.reference],
    ["Company", order.company],
    ["Agent", order.agentName],
    ["Store", order.storeCode],
    ["Contact", order.contactName],
    ["Email", order.customerEmail],
    ["PO number", order.customerPo],
    ["Phone", order.contactPhone],
    ["Comments", order.comments],
    [],
    [
      "Product",
      "SKU",
      "Barcode",
      "Order unit",
      "Order qty",
      "Units per order",
      "Cost/unit",
      "Dealer/unit",
      "SRP/unit",
      "Dealer total",
      "Retail total",
    ],
    ...order.lines.map((l) => [
      l.name,
      l.sku,
      l.barcode,
      l.orderUnit,
      l.qty,
      l.unitsPerOrder,
      l.cost,
      l.dealerUnit,
      l.srpUnit,
      l.lineDealer,
      l.lineRetail,
    ]),
    [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      order.totalDealer,
      order.totalRetail,
    ],
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `terranova-${order.reference}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OrderReceipt({ order }: { order: Order }) {
  const { t, language, money: moneyFormat } = useLanguage();
  return (
    <section className="receipt">
      <div
        className="invoice-branding"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: 24,
        }}
      >
        <img
          src="/images/terra-nova-logo.png"
          alt="Terra Nova"
          width={260}
          height={70}
          style={{ width: "min(60%, 260px)", height: 70, objectFit: "contain" }}
        />
        {order.company.trim().toLowerCase() === "canadian tire" && (
          <img
            src="/images/canadian-tire-clean.png"
            alt="Canadian Tire"
            width={84}
            height={70}
            style={{ width: 84, height: 70, objectFit: "contain" }}
          />
        )}
      </div>
      <div className="eyebrow">{t("Order confirmation")}</div>
      <h2>{order.reference}</h2>
      <p className="muted">
        {new Date(order.date).toLocaleString(
          language === "fr" ? "fr-CA" : "en-CA",
          {
            timeZone: "America/Toronto",
          },
        )}
      </p>
      <p>
        {order.company} · {order.agentName}
        <br />
        {t("Store")} {order.storeCode} · {order.contactName}
        <br />
        {order.customerEmail}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Product")}</th>
              <th>{t("Quantity")}</th>
              <th>{t("Units")}</th>
              <th>{t("Total")}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <div className="receipt-product">
                    {l.image && (
                      <img
                        className="receipt-thumbnail"
                        src={l.image}
                        alt={t(l.name)}
                        width={56}
                        height={72}
                      />
                    )}
                    <div>
                      {t(l.name)}
                      <small>{l.sku}</small>
                    </div>
                  </div>
                </td>
                <td>
                  {l.qty} {t(l.orderUnit)}
                </td>
                <td>{l.qty * l.unitsPerOrder}</td>
                <td>{moneyFormat(l.lineDealer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="receipt-total">
        {t("Dealer total")} <strong>{moneyFormat(order.totalDealer)}</strong>
      </div>
      <p className="muted">
        {t("Retail value:")} {moneyFormat(order.totalRetail)}
      </p>
      {order.customerPo && <p>PO: {order.customerPo}</p>}
      {order.contactPhone && (
        <p>
          {t("Phone:")} {order.contactPhone}
        </p>
      )}
      {order.comments && <p className="comments">{order.comments}</p>}
      <div className="actions no-print">
        <button onClick={() => exportOrder(order)} className="secondary">
          {t("Download CSV")}
        </button>
        <button
          className="secondary"
          onClick={async (e) => {
            const images = e.currentTarget
              .closest(".receipt")
              ?.querySelectorAll("img");
            await Promise.allSettled(
              Array.from(images ?? []).map((image) => image.decode()),
            );
            window.print();
          }}
        >
          {t("Print / save PDF")}
        </button>
      </div>
    </section>
  );
}
