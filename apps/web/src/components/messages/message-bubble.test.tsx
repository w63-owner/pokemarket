import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HTMLAttributes } from "react";
import type { Message } from "@/types";
import { MessageBubble } from "./message-bubble";

vi.mock("framer-motion", () => ({
  m: {
    div: ({
      layout: _layout,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      layout?: unknown;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props} />,
  },
  useReducedMotion: () => true,
}));

vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn() }),
}));

const failedMessage: Message = {
  id: "temp-1",
  conversation_id: "conversation-1",
  sender_id: "user-1",
  content: "Message à réessayer",
  message_type: "text",
  offer_id: null,
  metadata: { client_id: "client-1" },
  read_at: null,
  created_at: "2026-07-31T12:00:00.000Z",
};

describe("MessageBubble", () => {
  it("keeps a failed optimistic message actionable for retry", () => {
    const onRetry = vi.fn();

    render(
      <MessageBubble
        message={failedMessage}
        isOwn
        isFailed
        currentUserId="user-1"
        otherUsername="Ondine"
        onRetry={onRetry}
      />,
    );

    const retryBubble = screen.getByRole("button", {
      name: "Échec de l'envoi. Activer pour réessayer.",
    });
    expect(screen.getByText("Échec · cliquer pour réessayer")).toBeDefined();
    fireEvent.click(retryBubble);
    expect(onRetry).toHaveBeenCalledWith(failedMessage);
  });
});
