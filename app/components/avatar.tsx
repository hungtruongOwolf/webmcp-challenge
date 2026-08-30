"use client";

import Image from "next/image";
import type { User } from "@/app/types";

import useActiveList from "@/app/hooks/use-active-list";
import { useUiSettings } from "@/app/context/ui-settings-context";
import { avatarColors, initialsFromName } from "@/app/libs/avatar-color";

type AvatarProps = {
  user?: User | null;
  size?: number;
  showStatus?: boolean;
};

const Avatar: React.FC<AvatarProps> = ({ user, size = 44, showStatus = true }) => {
  const { members } = useActiveList();
  const { theme } = useUiSettings();
  const isActive = members.indexOf(user?.id!) !== -1;
  const { bg, fg } = avatarColors(user?.name || user?.email || "?", theme === "dark");

  return (
    <div style={{ position: "relative", flex: "none", width: size, height: size }}>
      {user?.image ? (
        <div
          style={{
            position: "relative",
            width: size,
            height: size,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <Image src={user.image} alt={user?.name || "avatar"} fill sizes={`${size}px`} style={{ objectFit: "cover" }} />
        </div>
      ) : (
        <span
          aria-hidden
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            background: bg,
            color: fg,
            fontSize: size * 0.33,
            fontWeight: 600,
            display: "grid",
            placeItems: "center",
          }}
        >
          {initialsFromName(user?.name)}
        </span>
      )}
      {showStatus && isActive && (
        <span
          aria-label="Online"
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: 999,
            background: "var(--lagoon)",
            boxShadow: "0 0 0 2.5px var(--s1)",
          }}
        />
      )}
    </div>
  );
};

export default Avatar;
