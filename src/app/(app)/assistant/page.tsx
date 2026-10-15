import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat/chat-panel";
import { loadChat } from "@/lib/db/chat";
import { getDb } from "@/lib/db/client";
import { currentSession } from "@/lib/session";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const chat = await loadChat(getDb(), session.id);
  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-[1240px] flex-col md:h-[calc(100dvh-5rem)]">
      <h1 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] text-text md:text-[32px]">Assistant</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Ask about your simulated account. Answers use live figures from your data; budget changes need your approval.
      </p>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <ChatPanel initialMessages={chat} variant="page" />
      </div>
    </div>
  );
}
