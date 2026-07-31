export const channels = {
  inbox: (userId: string) => `inbox:${userId}`,
  thread: (conversationId: string) => `thread:${conversationId}`,
  offersDashboard: (userId: string) => `offers-dashboard:${userId}`,
} as const;
