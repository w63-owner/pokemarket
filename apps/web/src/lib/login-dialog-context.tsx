"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type LoginDialogContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const LoginDialogContext = createContext<LoginDialogContextType | null>(null);

export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <LoginDialogContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </LoginDialogContext.Provider>
  );
}

export function useLoginDialog() {
  const ctx = useContext(LoginDialogContext);
  if (!ctx)
    throw new Error("useLoginDialog must be used inside LoginDialogProvider");
  return ctx;
}
