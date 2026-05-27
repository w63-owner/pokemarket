import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";

type ContentType = "image/jpeg" | "image/webp" | "image/png";

const EXT: Record<ContentType, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
};

/**
 * Upload an image from a local `file://` URI to Supabase Storage using
 * Expo's `FileSystem.uploadAsync`.
 *
 * Unlike the previous base64 → ArrayBuffer path, this sends the file
 * directly from the native layer (NSURLSession / OkHttp) without ever
 * materialising the bytes in the JS heap — eliminating the ~2× memory
 * spike that occurred during large image uploads.
 *
 * @param uri          Local file URI returned by ImagePicker / ImageManipulator.
 * @param contentType  MIME type of the image.
 * @param bucket       Supabase Storage bucket name.
 * @param storagePath  Destination object path inside the bucket.
 * @param upsert       Whether to overwrite an existing object (default: false).
 */
export async function uploadImageFromUri(params: {
  uri: string;
  contentType: ContentType;
  bucket: string;
  storagePath: string;
  upsert?: boolean;
}): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) throw new Error("Non authentifié");

  const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${params.bucket}/${params.storagePath}`;

  const result = await uploadAsync(endpoint, params.uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": params.contentType,
      "cache-control": "31536000",
      "x-upsert": params.upsert ? "true" : "false",
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Upload failed (${result.status}): ${result.body ?? "unknown error"}`,
    );
  }
}

/**
 * Derive the extension string from a content-type.
 */
export function contentTypeToExt(contentType: ContentType): string {
  return EXT[contentType] ?? "jpg";
}
