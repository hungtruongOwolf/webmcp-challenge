import getConversationById from "@/app/actions/get-conversation-by-id";
import getMessages from "@/app/actions/get-messages";
import EmptyState from "@/app/components/empty-state";

import Thread from "./components/thread";

type IParams = {
  conversationId: string;
};

const ConversationId = async ({ params }: { params: Promise<IParams> }) => {
  const { conversationId } = await params;

  const conversation = await getConversationById(conversationId);
  const messages = await getMessages(conversationId);

  if (!conversation) {
    return <EmptyState />;
  }

  return <Thread conversation={conversation} initialMessages={messages} />;
};

export default ConversationId;
