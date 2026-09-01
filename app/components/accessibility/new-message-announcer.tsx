"use client";

import { useConversationsList } from "@/app/context/conversations-context";

/**
 * Screen-reader-only announcement for a message that just arrived in a
 * conversation the user isn't currently looking at. The open thread's own
 * message log (role="log" aria-live="polite" in body.tsx) already covers
 * new messages there -- this is for everywhere else in the app, since
 * there's no visual badge a blind user could otherwise notice, and no way
 * for the page to interrupt a WebMCP voice agent unprompted (the agent
 * only acts when asked; there's no page-initiated push into it).
 */
const NewMessageAnnouncer = () => {
  const { newMessageAnnouncement } = useConversationsList();

  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {newMessageAnnouncement}
    </span>
  );
};

export default NewMessageAnnouncer;
