import type { Database } from "@/app/types/database";

/**
 * Row types generated from the live Supabase schema. `User` keeps its old
 * name so the component tree does not have to be renamed wholesale -- it is
 * now a profiles row rather than a Prisma model.
 */
export type User = Database["public"]["Tables"]["profiles"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Draft = Database["public"]["Tables"]["drafts"]["Row"];

export type FullMessageType = Message & {
  sender: User;
  seen: User[];
};

export type FullConversationType = Conversation & {
  users: User[];
  messages: FullMessageType[];
};
