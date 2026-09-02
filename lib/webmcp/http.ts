/** The plain-text refusal a route sent back, or "" when there is none to read. */
export const readErrorDetail = async (res: { text?: () => Promise<string> }): Promise<string> =>
  (await res.text?.().catch(() => "")) || "";
