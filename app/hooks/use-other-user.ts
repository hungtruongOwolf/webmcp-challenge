import { useCurrentUser } from "@/app/context/current-user-context";
import { useMemo } from "react";
import type { FullConversationType } from "../types";
import type { User } from "@/app/types";

const useOtherUser = (
  conversation:
    | FullConversationType
    | {
        users: User[];
      }
) => {
  const currentUser = useCurrentUser();
  const otherUser = useMemo(() => {
    const currentUserEmail = currentUser?.email;
    const otherUser = conversation.users.filter(
      (user) => user.email !== currentUserEmail
    );

    return otherUser[0];
  }, [currentUser?.email, conversation.users]);

  return otherUser;
};

export default useOtherUser;
