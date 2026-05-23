"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  sellerId: string;
  initialIsFollowing: boolean;
}

export function FollowButton({
  sellerId,
  initialIsFollowing,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleToggle() {
    const previous = isFollowing;
    setIsFollowing(!previous);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsFollowing(previous);
        toast("Connectez-vous pour suivre ce vendeur", {
          action: {
            label: "Se connecter",
            onClick: () => {
              window.location.href = "/auth";
            },
          },
        });
        return;
      }

      if (previous) {
        const { error } = await supabase
          .from("favorite_sellers")
          .delete()
          .eq("user_id", user.id)
          .eq("seller_id", sellerId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorite_sellers")
          .insert({ user_id: user.id, seller_id: sellerId });

        if (error) throw error;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setIsFollowing(previous);
      toast.error("Une erreur est survenue. Réessayez.");
    }
  }

  const Icon = isFollowing ? UserCheck : UserPlus;

  return (
    <m.button
      onClick={handleToggle}
      disabled={isPending}
      whileTap={{ scale: 0.95 }}
      transition={spring.snappy}
      className={cn(
        "fixed bottom-20 left-1/2 z-50 flex w-[90%] max-w-sm -translate-x-1/2 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-colors disabled:opacity-70",
        isFollowing
          ? "bg-secondary text-secondary-foreground border-border border"
          : "bg-primary text-primary-foreground",
      )}
    >
      <Icon className="size-4" />
      {isFollowing ? "Suivi" : "Suivre"}
    </m.button>
  );
}
