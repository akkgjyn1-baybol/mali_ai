"use client";

import { useCallback, useEffect, useState } from "react";
import { Onboarding } from "./Onboarding";
import { ViewportSync } from "./ViewportSync";
import type { User } from "@/lib/types";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/setup");
    const data = await res.json();
    setUser(data.user);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-silver-400">
        <ViewportSync />
        <p className="font-serif text-2xl">Mali</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ViewportSync />
        <Onboarding onDone={load} />
      </>
    );
  }

  return (
    <>
      <ViewportSync />
      {children}
    </>
  );
}
