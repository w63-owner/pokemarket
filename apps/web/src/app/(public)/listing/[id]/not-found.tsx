import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ListingNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-full">
        <SearchX className="size-8" aria-hidden="true" />
      </div>
      <h1 className="font-heading mt-5 text-2xl font-bold">
        Cette annonce n’est plus disponible
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Elle a peut-être été vendue ou retirée par son vendeur.
      </p>
      <Button className="mt-6" render={<Link href="/" />}>
        Découvrir d’autres cartes
      </Button>
    </div>
  );
}
