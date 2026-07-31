import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HTMLAttributes } from "react";
import { MessageInput } from "./message-input";

vi.mock("framer-motion", () => ({
  m: {
    div: ({
      whileTap: _whileTap,
      ...props
    }: HTMLAttributes<HTMLDivElement> & { whileTap?: unknown }) => (
      <div {...props} />
    ),
  },
  useReducedMotion: () => true,
}));

describe("MessageInput", () => {
  it("exposes accessible controls and sends trimmed text", () => {
    const onSend = vi.fn();

    render(
      <MessageInput
        onSend={onSend}
        currentUserId="user-1"
        otherUsername="Ondine"
      />,
    );

    const composer = screen.getByLabelText(
      "Votre message",
    ) as HTMLTextAreaElement;
    expect(
      screen.getByRole("form", { name: "Composer un message" }),
    ).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Envoyer une image",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(composer, { target: { value: "  Bonjour  " } });
    fireEvent.submit(screen.getByRole("form", { name: "Composer un message" }));

    expect(onSend).toHaveBeenCalledWith("Bonjour", undefined);
    expect(composer.value).toBe("");
  });

  it("renders and cancels the active quoted reply", () => {
    const onCancelReply = vi.fn();

    render(
      <MessageInput
        onSend={vi.fn()}
        onSendImage={vi.fn()}
        replyingTo={{
          id: "message-1",
          content: "Message cité",
          sender_id: "user-2",
          message_type: "text",
        }}
        onCancelReply={onCancelReply}
        currentUserId="user-1"
        otherUsername="Ondine"
      />,
    );

    expect(screen.getByText("Ondine")).toBeDefined();
    expect(screen.getByText("Message cité")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Annuler la réponse" }));
    expect(onCancelReply).toHaveBeenCalledOnce();
  });
});
