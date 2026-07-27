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
  refund(transactionId: string, requestId: string): string {
    return `refund-${transactionId}-${requestId}`;
  },
};
