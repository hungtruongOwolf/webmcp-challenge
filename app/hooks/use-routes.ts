import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HiChat } from "react-icons/hi";
import { HiArrowLeftOnRectangle, HiUsers } from "react-icons/hi2";

import useConversation from "@/app/hooks/use-conversation";
import { createClient } from "@/app/libs/supabase/client";

const useRoutes = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { conversationId } = useConversation();

  const routes = useMemo(
    () => [
      {
        label: "Chat",
        href: "/conversations",
        icon: HiChat,
        active: pathname === "/conversations" || !!conversationId,
      },
      {
        label: "Users",
        href: "/users",
        icon: HiUsers,
        active: pathname === "/users",
      },
      {
        label: "Logout",
        href: "#",
        onClick: async () => {
          await createClient().auth.signOut();
          router.push("/");
          router.refresh();
        },
        icon: HiArrowLeftOnRectangle,
      },
    ],
    [pathname, conversationId, router]
  );

  return routes;
};

export default useRoutes;
