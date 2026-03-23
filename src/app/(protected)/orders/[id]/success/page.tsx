import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";

const SuccessClient = dynamic(() =>
  import("./success-client").then((mod) => mod.SuccessClient),
);

export const metadata: Metadata = {
  title: "Commande confirmée",
};

type Props = { params: Promise<{ id: string }> };

export default async function OrderSuccessPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: transaction } = await supabase
    .from("transactions")
    .select("id, listing_title, total_amount, status")
    .eq("id", id)
    .eq("buyer_id", user.id)
    .single();

  if (!transaction) notFound();

  return (
    <SuccessClient
      transaction={{
        id: transaction.id,
        listing_title: transaction.listing_title,
        total_amount: transaction.total_amount,
        status: transaction.status,
      }}
    />
  );
}
