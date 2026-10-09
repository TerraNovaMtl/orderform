import {
  LanguageProvider,
  CustomerAccess,
  CustomerFooter,
} from "@/components/language";
import { Catalog } from "@/components/catalog";
import { Brand } from "@/components/shared";
import { getAgent } from "@/lib/repository";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; store?: string }>;
}) {
  const params = await searchParams;
  const code = typeof params.vendor === "string" ? params.vendor.trim() : "";
  const company = code
    ? await getAgent(code)
        .then((a) => a.company)
        .catch(() => "")
    : "";
  return (
    <LanguageProvider>
      <Brand company={company} />
      {code ? (
        <Catalog
          code={code}
          initialStoreCode={
            typeof params.store === "string" ? params.store.trim() : ""
          }
        />
      ) : (
        <CustomerAccess />
      )}
      <CustomerFooter />
    </LanguageProvider>
  );
}
