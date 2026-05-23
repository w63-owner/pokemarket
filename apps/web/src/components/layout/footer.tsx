import Link from "next/link";

const legalLinks = [
  { href: "/legal/cgv", label: "CGV" },
  { href: "/legal/cgu", label: "CGU" },
  { href: "/legal/privacy", label: "Confidentialité" },
  { href: "/legal/mentions", label: "Mentions légales" },
] as const;

export function Footer() {
  return (
    <footer className="border-border border-t py-6 pb-20 lg:pb-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} PokeMarket. Tous droits réservés.
        </p>
        <nav
          aria-label="Liens légaux"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
        >
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
