import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/types/database";

config({ path: ".env.local", quiet: true });

const enabled = process.env.SUPABASE_E2E_ENABLED === "true";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !enabled || !supabaseUrl || !anonKey || !serviceRoleKey,
  "Set SUPABASE_E2E_ENABLED=true and Supabase credentials to run",
);

test("delivers message inserts and read receipts through real Supabase Realtime", async () => {
  test.setTimeout(45_000);

  const admin = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = randomUUID();
  const password = `E2e-${randomUUID()}-Aa1!`;
  const buyerEmail = `realtime-buyer-${suffix}@example.test`;
  const sellerEmail = `realtime-seller-${suffix}@example.test`;
  let buyerId: string | undefined;
  let sellerId: string | undefined;
  let listingId: string | undefined;
  let conversationId: string | undefined;
  const removeChannels: Array<() => Promise<unknown>> = [];

  try {
    const [buyerResult, sellerResult] = await Promise.all([
      admin.auth.admin.createUser({
        email: buyerEmail,
        password,
        email_confirm: true,
        user_metadata: { username: `rt_b_${suffix.slice(0, 8)}` },
      }),
      admin.auth.admin.createUser({
        email: sellerEmail,
        password,
        email_confirm: true,
        user_metadata: { username: `rt_s_${suffix.slice(0, 8)}` },
      }),
    ]);
    expect(buyerResult.error).toBeNull();
    expect(sellerResult.error).toBeNull();
    buyerId = buyerResult.data.user?.id;
    sellerId = sellerResult.data.user?.id;
    expect(buyerId).toBeTruthy();
    expect(sellerId).toBeTruthy();

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({
        seller_id: sellerId!,
        title: `Realtime E2E ${suffix}`,
        price_seller: 10,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    expect(listingError).toBeNull();
    listingId = listing!.id;

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({
        listing_id: listingId,
        buyer_id: buyerId!,
        seller_id: sellerId!,
      })
      .select("id")
      .single();
    expect(conversationError).toBeNull();
    conversationId = conversation!.id;

    const buyer = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const seller = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [buyerSignIn, sellerSignIn] = await Promise.all([
      buyer.auth.signInWithPassword({ email: buyerEmail, password }),
      seller.auth.signInWithPassword({ email: sellerEmail, password }),
    ]);
    expect(buyerSignIn.error).toBeNull();
    expect(sellerSignIn.error).toBeNull();
    expect(buyerSignIn.data.session?.access_token).toBeTruthy();
    expect(sellerSignIn.data.session?.access_token).toBeTruthy();
    buyer.realtime.setAuth(buyerSignIn.data.session!.access_token);
    seller.realtime.setAuth(sellerSignIn.data.session!.access_token);

    let resolveInsert!: (
      row: Database["public"]["Tables"]["messages"]["Row"],
    ) => void;
    const insertReceived = new Promise<
      Database["public"]["Tables"]["messages"]["Row"]
    >((resolve) => {
      resolveInsert = resolve;
    });
    const buyerChannel = buyer.channel(`e2e-message-insert-${suffix}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) =>
        resolveInsert(
          payload.new as Database["public"]["Tables"]["messages"]["Row"],
        ),
    );
    removeChannels.push(() => buyer.removeChannel(buyerChannel));
    await new Promise<void>((resolve, reject) => {
      buyerChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Realtime insert subscription failed: ${status}`));
        }
      });
    });

    const { data: inserted, error: insertError } = await seller
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: sellerId!,
        content: "Message Realtime E2E",
        message_type: "text",
        metadata: { client_id: suffix },
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const realtimeInsert = await Promise.race([
      insertReceived,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Realtime INSERT timed out")),
          10_000,
        ),
      ),
    ]);
    expect(realtimeInsert.id).toBe(inserted!.id);
    expect(realtimeInsert.content).toBe("Message Realtime E2E");

    let resolveUpdate!: (
      row: Database["public"]["Tables"]["messages"]["Row"],
    ) => void;
    const updateReceived = new Promise<
      Database["public"]["Tables"]["messages"]["Row"]
    >((resolve) => {
      resolveUpdate = resolve;
    });
    const sellerChannel = seller.channel(`e2e-message-update-${suffix}`).on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) =>
        resolveUpdate(
          payload.new as Database["public"]["Tables"]["messages"]["Row"],
        ),
    );
    removeChannels.push(() => seller.removeChannel(sellerChannel));
    await new Promise<void>((resolve, reject) => {
      sellerChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Realtime update subscription failed: ${status}`));
        }
      });
    });

    const { error: readError } = await buyer
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", inserted!.id);
    expect(readError).toBeNull();

    const realtimeUpdate = await Promise.race([
      updateReceived,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Realtime UPDATE timed out")),
          10_000,
        ),
      ),
    ]);
    expect(realtimeUpdate.id).toBe(inserted!.id);
    expect(realtimeUpdate.read_at).toBeTruthy();
  } finally {
    await Promise.all(removeChannels.map((removeChannel) => removeChannel()));
    if (conversationId) {
      await admin
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }
    if (listingId) await admin.from("listings").delete().eq("id", listingId);
    if (buyerId) await admin.auth.admin.deleteUser(buyerId);
    if (sellerId) await admin.auth.admin.deleteUser(sellerId);
  }
});
