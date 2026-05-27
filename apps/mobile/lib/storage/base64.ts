/**
 * Decode a base64 string into an `ArrayBuffer`. React Native lacks a
 * reliable `File` / `Blob.arrayBuffer()` for `file://` URIs across iOS
 * and Android, so we go through `globalThis.atob` (polyfilled by
 * `react-native-url-polyfill/auto` which is imported from
 * `lib/supabase.ts` at boot).
 *
 * Used by every Supabase Storage upload helper:
 *   • `lib/api/listings.ts:uploadListingImage`
 *   • `lib/api/conversations.ts:sendImageMessage`
 *   • `components/profile/avatar-uploader.tsx`
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
