import type { Message } from "../types";

export type MessagePages = {
  pages: Array<{ messages: Message[] }>;
  pageParams: unknown[];
};

function clientIdOf(message: Message): unknown {
  return (message.metadata as Record<string, unknown> | null)?.client_id;
}

export function reconcileOptimisticMessages(
  pending: Message[],
  incoming: Message,
): Message[] {
  const incomingClientId = clientIdOf(incoming);
  const index = pending.findIndex((message) =>
    incomingClientId
      ? clientIdOf(message) === incomingClientId
      : message.content === incoming.content &&
        message.message_type === incoming.message_type,
  );
  if (index === -1) return pending;
  return [...pending.slice(0, index), ...pending.slice(index + 1)];
}

export function prependMessageIfMissing<T extends MessagePages>(
  current: T | undefined,
  incoming: Message,
): T | undefined {
  if (!current) return current;
  if (
    current.pages.some((page) =>
      page.messages.some((message) => message.id === incoming.id),
    )
  ) {
    return current;
  }
  return {
    ...current,
    pages: current.pages.map((page, index) =>
      index === 0 ? { ...page, messages: [incoming, ...page.messages] } : page,
    ),
  };
}

export function applyMessageReadReceipt<T extends MessagePages>(
  current: T | undefined,
  updated: Pick<Message, "id" | "read_at">,
): T | undefined {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === updated.id
          ? { ...message, read_at: updated.read_at }
          : message,
      ),
    })),
  };
}

export function getNextMessageCursor(
  messages: Message[],
  pageSize: number,
): { created_at: string; id: string } | null {
  const last = messages.at(-1);
  return messages.length === pageSize && last?.created_at
    ? { created_at: last.created_at, id: last.id }
    : null;
}
