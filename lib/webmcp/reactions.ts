/**
 * Shared between react_to_message and read_conversation. Names alongside
 * the glyphs matter for voice agents (ChatGPT Voice, screen readers) that
 * need to say the option out loud rather than just render the emoji.
 */
export const REACTIONS = [
  { emoji: "👍", name: "thumbs up" },
  { emoji: "❤️", name: "heart" },
  { emoji: "😆", name: "laughing" },
  { emoji: "😮", name: "surprised" },
  { emoji: "😢", name: "crying" },
  { emoji: "😡", name: "angry" },
] as const;

export const REACTION_EMOJI = REACTIONS.map((r) => r.emoji) as unknown as readonly string[];

const NAME_BY_EMOJI = new Map<string, string>(REACTIONS.map((r) => [r.emoji, r.name]));

export function reactionLabel(emoji: string): string {
  const name = NAME_BY_EMOJI.get(emoji);
  return name ? `${emoji} ${name}` : emoji;
}

export function reactionOptionsList(): string {
  return REACTIONS.map((r) => `${r.emoji} (${r.name})`).join(", ");
}
