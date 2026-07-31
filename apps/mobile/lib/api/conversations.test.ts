import { api } from "@/lib/api/client";
import { requireUserId } from "@/lib/auth/current-user";
import {
  contentTypeToExt,
  uploadImageFromUri,
} from "@/lib/storage/upload-image";
import {
  createMessageImageStoragePath,
  ImageMessageSendError,
  sendImageMessage,
} from "./conversations";

jest.mock("@/lib/api/client", () => ({
  api: { post: jest.fn() },
}));
jest.mock("@/lib/auth/current-user", () => ({
  getCurrentUserId: jest.fn(),
  requireUserId: jest.fn(),
}));
jest.mock("@/lib/storage/upload-image", () => ({
  contentTypeToExt: jest.fn(() => "jpg"),
  uploadImageFromUri: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

const mockPost = jest.mocked(api.post);
const mockRequireUserId = jest.mocked(requireUserId);
const mockUploadImageFromUri = jest.mocked(uploadImageFromUri);
const mockContentTypeToExt = jest.mocked(contentTypeToExt);

describe("mobile image messages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireUserId.mockResolvedValue("user-1");
  });

  it("creates a stable conversation-scoped storage path", () => {
    mockContentTypeToExt.mockReturnValue("webp");

    const path = createMessageImageStoragePath("conversation-1", "image/webp");

    expect(path).toMatch(/^conversation-1\/.+\.webp$/);
  });

  it("reuses the uploaded path and client id without requiring storage UPDATE", async () => {
    const message = {
      id: "message-1",
      conversation_id: "conversation-1",
      sender_id: "user-1",
      content: "conversation-1/image.jpg",
      message_type: "image",
      metadata: { client_id: "client-1" },
      offer_id: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    mockPost.mockResolvedValue({ message });

    await expect(
      sendImageMessage(
        "conversation-1",
        {
          uri: "file:///image.jpg",
          contentType: "image/jpeg",
          storagePath: "conversation-1/image.jpg",
          skipUpload: true,
        },
        "client-1",
      ),
    ).resolves.toEqual(message);

    expect(mockUploadImageFromUri).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/api/messages/send", {
      type: "image",
      conversation_id: "conversation-1",
      storage_path: "conversation-1/image.jpg",
      client_id: "client-1",
    });
  });

  it("keeps an uploaded file when the API response fails so retry stays idempotent", async () => {
    mockPost.mockRejectedValue(new Error("network timeout"));

    const result = sendImageMessage(
      "conversation-1",
      {
        uri: "file:///image.jpg",
        contentType: "image/jpeg",
        storagePath: "conversation-1/image.jpg",
      },
      "client-1",
    );

    await expect(result).rejects.toThrow("network timeout");
    await expect(result).rejects.toBeInstanceOf(ImageMessageSendError);
    await expect(result).rejects.toMatchObject({ imageUploaded: true });

    expect(mockUploadImageFromUri).toHaveBeenCalledWith({
      uri: "file:///image.jpg",
      contentType: "image/jpeg",
      bucket: "message_attachments",
      storagePath: "conversation-1/image.jpg",
    });
  });

  it("does not mark upload failures as safe to skip", async () => {
    mockUploadImageFromUri.mockRejectedValue(new Error("upload failed"));

    await expect(
      sendImageMessage(
        "conversation-1",
        {
          uri: "file:///image.jpg",
          contentType: "image/jpeg",
          storagePath: "conversation-1/image.jpg",
        },
        "client-1",
      ),
    ).rejects.not.toBeInstanceOf(ImageMessageSendError);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
