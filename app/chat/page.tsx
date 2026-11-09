"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Chat } from "@/components/Chat";

export default function ChatPage() {
  return (
    <AuthGate>
      <AppShell title="Mali">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-silver-400">Mali</div>}>
          <Chat />
        </Suspense>
      </AppShell>
    </AuthGate>
  );
}
