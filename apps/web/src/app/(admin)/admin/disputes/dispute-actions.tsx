"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  disputeId: string;
  canRespond: boolean;
};

export function DisputeActions({ disputeId, canRespond }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [productDescription, setProductDescription] = useState("");
  const [argument, setArgument] = useState("");
  const [tracking, setTracking] = useState("");

  async function runAction(body: Record<string, unknown>) {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/stripe-disputes/${disputeId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Action impossible");
      toast.success("Action Stripe enregistrée");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Action impossible");
    } finally {
      setPending(false);
    }
  }

  if (!canRespond) return null;

  return (
    <div className="flex justify-end gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <FileUp className="h-4 w-4" />
              Preuves
            </Button>
          }
        />
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Répondre au litige</DialogTitle>
            <DialogDescription>
              Décrivez le produit et fournissez les éléments factuels. Les
              fichiers doivent déjà avoir été chargés dans Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Description précise de la carte vendue"
              minLength={10}
            />
            <Textarea
              value={argument}
              onChange={(event) => setArgument(event.target.value)}
              placeholder="Chronologie, livraison, échanges et argumentaire"
              minLength={10}
              className="min-h-28"
            />
            <Input
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              placeholder="Numéro de suivi (facultatif)"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                runAction({
                  action: "submit_evidence",
                  product_description: productDescription,
                  uncategorized_text: argument,
                  shipping_tracking_number: tracking || undefined,
                  submit: false,
                })
              }
            >
              Enregistrer
            </Button>
            <Button
              disabled={
                pending ||
                productDescription.length < 10 ||
                argument.length < 10
              }
              onClick={() =>
                runAction({
                  action: "submit_evidence",
                  product_description: productDescription,
                  uncategorized_text: argument,
                  shipping_tracking_number: tracking || undefined,
                  submit: true,
                })
              }
            >
              Envoyer à la banque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              "Accepter définitivement ce litige et renoncer à le contester ?",
            )
          ) {
            void runAction({ action: "accept" });
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4" />
        Accepter
      </Button>
    </div>
  );
}
