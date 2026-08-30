"use client";

import Image from "next/image";
import type { User } from "@/app/types";

import { useUiSettings } from "@/app/context/ui-settings-context";
import { avatarColors, initialsFromName } from "@/app/libs/avatar-color";

type AvatarGroupProps = {
  users?: User[];
  size?: number;
};

const positionMap = {
  0: { top: 0, left: "18%" },
  1: { bottom: 0 },
  2: { bottom: 0, right: 0 },
};

const AvatarGroup: React.FC<AvatarGroupProps> = ({ users = [], size = 44 }) => {
  const { theme } = useUiSettings();
  const slicedUsers = users.slice(0, 3);
  const miniSize = Math.round(size * 0.48);

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      {slicedUsers.map((user, i) => {
        const { bg, fg } = avatarColors(user.name || user.email || "?", theme === "dark");

        return (
          <div
            key={user.id}
            style={{
              position: "absolute",
              width: miniSize,
              height: miniSize,
              borderRadius: 999,
              overflow: "hidden",
              boxShadow: "0 0 0 2px var(--s1)",
              ...positionMap[i as keyof typeof positionMap],
            }}
          >
            {user.image ? (
              <Image src={user.image} alt="" fill sizes={`${miniSize}px`} style={{ objectFit: "cover" }} />
            ) : (
              <span
                aria-hidden
                style={{
                  width: "100%",
                  height: "100%",
                  background: bg,
                  color: fg,
                  fontSize: miniSize * 0.4,
                  fontWeight: 600,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {initialsFromName(user.name)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AvatarGroup;
