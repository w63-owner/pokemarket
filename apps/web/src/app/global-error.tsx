"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  _reset,
}: {
  error: Error & { digest?: string };
  _reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#09090b",
          color: "#fafafa",
        }}
      >
        <div
          style={{ textAlign: "center", padding: "2rem", maxWidth: "420px" }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 1.5rem",
              borderRadius: "50%",
              backgroundColor: "rgba(239,68,68,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
            }}
          >
            ⚠️
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              margin: "0 0 0.5rem",
            }}
          >
            Une erreur critique est survenue
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#a1a1aa",
              margin: "0 0 2rem",
              lineHeight: 1.5,
            }}
          >
            L&apos;application a rencontré un problème inattendu. Veuillez
            recharger la page pour continuer.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "0.5rem",
              border: "1px solid #27272a",
              backgroundColor: "#18181b",
              color: "#fafafa",
              cursor: "pointer",
            }}
          >
            Recharger la page
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.75rem",
                color: "#52525b",
                fontFamily: "monospace",
              }}
            >
              Réf. : {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
