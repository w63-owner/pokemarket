export const stripeIdempotencyKeys = {
  customer(userId: string): string {
    return `customer-user-${userId}`;
  },
  checkoutSession(transactionId: string): string {
    return `checkout-session-${transactionId}`;
  },
  paymentIntent(transactionId: string): string {
    return `payment-intent-${transactionId}`;
  },
  connectAccount(userId: string): string {
    return `connect-recipient-v2-${userId}`;
  },
  refund(transactionId: string, requestId: string): string {
    return `refund-${transactionId}-${requestId}`;
  },
  transfer(transactionId: string): string {
    return `order-transfer-${transactionId}`;
  },
  payout(payoutId: string): string {
    return `seller-payout-${payoutId}`;
  },
};
