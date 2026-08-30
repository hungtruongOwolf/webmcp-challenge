export function hueFromName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export function avatarColors(name: string, dark: boolean) {
  const h = hueFromName(name || "?");

  return dark
    ? { bg: `hsl(${h} 26% 27%)`, fg: `hsl(${h} 52% 78%)` }
    : { bg: `hsl(${h} 44% 87%)`, fg: `hsl(${h} 42% 30%)` };
}

export function initialsFromName(name?: string | null) {
  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
