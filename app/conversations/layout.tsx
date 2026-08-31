import type { PropsWithChildren } from "react";

import ConversationsShell from "@/app/conversations/components/conversations-shell";
import getConversations from "@/app/actions/get-conversations";
import getUsers from "@/app/actions/get-users";
import getCurrentUser from "@/app/actions/get-current-user";

// A chat app's own sidebar list can never be cached across requests --
// each load has to see whatever was just sent, from any account.
export const dynamic = "force-dynamic";

export default async function ConversationsLayout({
  children,
}: PropsWithChildren) {
  const currentUser = await getCurrentUser();
  const conversations = await getConversations();
  const users = await getUsers();

  return (
    <ConversationsShell
      currentUser={currentUser!}
      initialConversations={conversations}
      users={users}
    >
      {children}
    </ConversationsShell>
  );
}
