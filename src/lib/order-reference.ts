export function orderReference(storeCode: string, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1 || counter > 99999)
    throw new Error("Order counter must be between 1 and 99999");
  return `TN-${storeCode}-${String(counter).padStart(4, "0")}`;
}
