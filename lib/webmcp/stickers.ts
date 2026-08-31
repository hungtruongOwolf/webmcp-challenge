/**
 * Big stand-alone emoji sent as their own message (Messenger's "sticker
 * tray"), distinct from react_to_message which reacts to an existing one.
 * Sending is a single tool call, same as reacting -- low-stakes, no
 * draft/confirm step needed.
 */
export const STICKERS = [
  { emoji: "👍", name: "thumbs up" },
  { emoji: "❤️", name: "heart" },
  { emoji: "😂", name: "laughing" },
  { emoji: "😮", name: "surprised" },
  { emoji: "😢", name: "crying" },
  { emoji: "😡", name: "angry" },
  { emoji: "🎉", name: "party popper" },
  { emoji: "🔥", name: "fire" },
  { emoji: "👏", name: "clapping" },
  { emoji: "🙏", name: "folded hands" },
  { emoji: "😍", name: "heart eyes" },
  { emoji: "🤔", name: "thinking" },
  { emoji: "😴", name: "sleeping" },
  { emoji: "🥳", name: "party face" },
  { emoji: "😅", name: "sweat smile" },
  { emoji: "🙌", name: "raising hands" },
  { emoji: "💯", name: "hundred points" },
  { emoji: "✨", name: "sparkles" },
  { emoji: "🎂", name: "birthday cake" },
  { emoji: "👋", name: "waving hand" },
] as const;

export const STICKER_EMOJI = STICKERS.map((s) => s.emoji) as unknown as readonly string[];

export function stickerOptionsList(): string {
  return STICKERS.map((s) => `${s.emoji} (${s.name})`).join(", ");
}
