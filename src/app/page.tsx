import { Catalog } from "@/components/catalog";
import { Brand } from "@/components/shared";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const params = await searchParams;
  const code = typeof params.vendor === "string" ? params.vendor.trim() : "";
  return (
    <>
      <Brand />
      {code ? <Catalog code={code} /> : <AccessRequired />}
      <footer>Terra Nova · Wholesale ordering</footer>
    </>
  );
}
export function AccessRequired() {
  return (
    <main className="access-card">
      <span className="eyebrow">Wholesale access</span>
      <h1>
        A collection selected
        <br />
        for your business.
      </h1>
      <p>
        This order form is available through your company agent’s personal link.
      </p>
      <p>
        <strong>Please contact your vendor for access.</strong>
      </p>
      <span className="access-line" />
    </main>
  );
}
