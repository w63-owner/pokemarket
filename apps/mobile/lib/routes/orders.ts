/**
 * Transaction domain vs mobile UI routes.
 *
 * Postgres and the API layer use `transactions`. The mobile UI splits
 * buyer/seller flows across role-specific paths ("Ma commande" vs "Ma vente")
 * without renaming the underlying model or breaking existing deep-links.
 *
 * | Role   | Screen               | Route                 |
 * |--------|----------------------|-----------------------|
 * | Either | Purchases/sales list | `/transactions`       |
 * | Buyer  | Order detail         | `/orders/:id`         |
 * | Buyer  | Checkout success     | `/orders/:id/success` |
 * | Seller | Sale detail          | `/profile/sales/:id`  |
 */
export const transactionRoutes = {
  list: () => "/transactions" as const,

  buyerDetail: (transactionId: string) => `/orders/${transactionId}` as const,

  buyerSuccess: (transactionId: string) =>
    `/orders/${transactionId}/success` as const,

  sellerDetail: (transactionId: string) =>
    `/profile/sales/${transactionId}` as const,

  detailForRole: (
    transactionId: string,
    role: "purchase" | "sale",
  ): `/orders/${string}` | `/profile/sales/${string}` =>
    role === "sale"
      ? transactionRoutes.sellerDetail(transactionId)
      : transactionRoutes.buyerDetail(transactionId),
} as const;
