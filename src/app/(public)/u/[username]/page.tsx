import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — Vendeur`,
    description: `Profil vendeur de ${username} sur PokeMarket`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, display_price, cover_image_url, condition")
    .eq("seller_id", profile.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating, comment, created_at")
    .eq("reviewee_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-20">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback className="text-2xl">
            {profile.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {profile.username}
          </h1>
          {profile.bio && (
            <p className="text-muted-foreground mt-1 text-sm">{profile.bio}</p>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            Membre depuis {formatDate(profile.created_at)}
          </p>
          {avgRating !== null && (
            <p className="mt-1 text-sm">
              ⭐ {avgRating.toFixed(1)} ({reviews?.length} avis)
            </p>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-heading text-lg font-semibold">
          Annonces actives ({listings?.length || 0})
        </h2>
        {listings && listings.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {listings.map((listing) => (
              <a
                key={listing.id}
                href={`/listing/${listing.id}`}
                className="border-border hover:bg-muted rounded-lg border p-2 transition-colors"
              >
                <div className="bg-muted aspect-[4/5] rounded-md" />
                <p className="mt-2 truncate text-sm font-medium">
                  {listing.title}
                </p>
                <p className="text-brand text-sm font-bold">
                  {listing.display_price?.toFixed(2)} €
                </p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Aucune annonce active.
          </p>
        )}
      </section>
    </div>
  );
}
