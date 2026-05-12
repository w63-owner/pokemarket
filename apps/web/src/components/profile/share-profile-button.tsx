"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareProfileButton({ username }: { username: string }) {
  async function handleShare() {
    const url = `${window.location.origin}/u/${username}`;
    const shareData = {
      title: `${username} sur PokeMarket`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          await copyToClipboard(url);
        }
      }
    } else {
      await copyToClipboard(url);
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleShare}>
      <Share2 className="size-5" />
      <span className="sr-only">Partager le profil</span>
    </Button>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Lien copié !");
  } catch {
    toast.error("Impossible de copier le lien");
  }
}
