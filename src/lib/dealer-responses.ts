import {
  dealerPrice,
  type Product,
  type Order,
  type DealerProduct,
  type DealerOrder,
} from "./domain";

// Explicit allowlist keeps internal product fields out of customer responses.
export function toDealerProduct(product: Product): DealerProduct {
  return {
    id: product.id,
    version: product.version,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    dealerPrice: dealerPrice(product),
    minimumOrder: product.minimumOrder,
    companyId: product.companyId,
    srp: product.srp,
    orderUnit: product.orderUnit,
    unitsPerOrder: product.unitsPerOrder,
    unitLabel: product.unitLabel,
    category: product.category,
    style: product.style,
    description: product.description,
    image: product.image,
    status: product.status,
    agentCodes: [],
    catalogKey: product.catalogKey,
  };
}

export function toDealerOrder(order: Order): DealerOrder {
  return {
    ...order,
    lines: order.lines.map(({ cost: _cost, ...line }) => line),
  };
}
