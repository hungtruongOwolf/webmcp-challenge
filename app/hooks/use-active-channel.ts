import { useEffect } from "react";
import type { RealtimePresenceState } from "@supabase/supabase-js";

import useActiveList from "@/app/hooks/use-active-list";
import { useCurrentUser } from "@/app/context/current-user-context";
import { createClient } from "@/app/libs/supabase/client";

const useActiveChannel = () => {
  const { set } = useActiveList();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const channel = supabase.channel("online", {
      config: { presence: { key: currentUser.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state: RealtimePresenceState = channel.presenceState();
        set(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, set]);
};

export default useActiveChannel;
