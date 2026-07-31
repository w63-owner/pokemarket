"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, BellOff, Flag, MoreVertical, ShieldBan } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { queryKeys } from "@pokemarket/shared";
import {
  blockUser,
  reportConversation,
  setConversationSettings,
} from "@/lib/api/conversations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ReportReason = "spam" | "harassment" | "scam" | "inappropriate" | "other";

export function ConversationActions({
  conversationId,
  otherUserId,
  isArchived,
  isMuted,
}: {
  conversationId: string;
  otherUserId: string;
  isArchived: boolean;
  isMuted: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const refreshInbox = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(),
    });

  const settingsMutation = useMutation({
    mutationFn: ({
      conversationId: id,
      settings,
    }: {
      conversationId: string;
      settings: { archived?: boolean; mutedUntil?: string | null };
    }) => setConversationSettings(id, settings),
    onSuccess: async () => {
      await refreshInbox();
      toast.success("Préférences mises à jour");
    },
    onError: () => toast.error("Impossible de modifier la conversation"),
  });

  const reportMutation = useMutation({
    mutationFn: (reason: ReportReason) =>
      reportConversation(
        conversationId,
        reason,
        "Signalement envoyé depuis la conversation.",
      ),
    onSuccess: () => toast.success("Signalement transmis à la modération"),
    onError: () => toast.error("Ce contenu a déjà été signalé"),
  });

  const blockMutation = useMutation({
    mutationFn: () => blockUser(otherUserId),
    onSuccess: async () => {
      await refreshInbox();
      toast.success("Utilisateur bloqué");
      router.replace("/messages");
    },
    onError: () => toast.error("Impossible de bloquer cet utilisateur"),
  });

  const setArchived = () => {
    settingsMutation.mutate({
      conversationId,
      settings: { archived: !isArchived },
    });
    router.replace("/messages");
  };

  const setMuted = () => {
    settingsMutation.mutate({
      conversationId,
      settings: {
        mutedUntil: isMuted
          ? null
          : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString(),
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actions de la conversation"
          />
        }
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={setMuted}>
          <BellOff />
          {isMuted ? "Réactiver les notifications" : "Mettre en sourdine"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={setArchived}>
          <Archive />
          {isArchived ? "Désarchiver" : "Archiver"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Flag />
            Signaler
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => reportMutation.mutate("spam")}>
              Spam
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => reportMutation.mutate("harassment")}
            >
              Harcèlement
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => reportMutation.mutate("scam")}>
              Arnaque
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => reportMutation.mutate("inappropriate")}
            >
              Contenu inapproprié
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => blockMutation.mutate()}
        >
          <ShieldBan />
          Bloquer cet utilisateur
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
