"use client";
import { useEffect, useRef } from "react";
import { csvCell, moneyFormat, type Order } from "@/lib/domain";
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
export function Brand({ admin = false }: { admin?: boolean }) {
  return (
    <header className="brand-header">
      <a className="brand" href={admin ? "/admin" : "/"}>
        <img src="/images/image1.png" alt="Terra Nova" />
        <span>
          <strong>Terra Nova</strong>
          <small>
            {admin ? "Wholesale administration" : "Wholesale collection"}
          </small>
        </span>
      </a>
      <span className="header-note">
        Thoughtfully selected. Ready for your shelves.
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
          aria-label="Close dialog"
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
  return (
    <section className="receipt">
      <div className="eyebrow">Order confirmation</div>
      <h2>{order.reference}</h2>
      <p>
        {order.company} · {order.agentName}
        <br />
        Store {order.storeCode} · {order.contactName}
        <br />
        {order.customerEmail}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Units</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  <small>{l.sku}</small>
                </td>
                <td>
                  {l.qty} {l.orderUnit}
                </td>
                <td>{l.qty * l.unitsPerOrder}</td>
                <td>{moneyFormat(l.lineDealer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="receipt-total">
        Dealer total <strong>{moneyFormat(order.totalDealer)}</strong>
      </div>
      <p className="muted">Retail value: {moneyFormat(order.totalRetail)}</p>
      {order.comments && <p className="comments">{order.comments}</p>}
      <div className="actions no-print">
        <button onClick={() => exportOrder(order)} className="secondary">
          Download CSV
        </button>
        <button className="secondary" onClick={() => window.print()}>
          Print / save PDF
        </button>
      </div>
    </section>
  );
}
