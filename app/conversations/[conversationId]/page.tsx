"use client";

import { useEffect } from "react";

import { useConversationsList } from "@/app/context/conversations-context";
import useConversation from "@/app/hooks/use-conversation";
import EmptyState from "@/app/components/empty-state";

import Thread from "./components/thread";

const ConversationId = () => {
  const { conversationId } = useConversation();
  const { conversations, ensureConversation } = useConversationsList();

  const conversation = conversations.find((c) => c.id === conversationId);

  useEffect(() => {
    if (!conversation && conversationId) ensureConversation(conversationId);
  }, [conversation, conversationId, ensureConversation]);

  if (!conversation) return <EmptyState />;

  return <Thread conversation={conversation} initialMessages={conversation.messages} />;
};

export default ConversationId;
