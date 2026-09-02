import { textResult, wrapUntrusted } from "@/lib/webmcp/budget";

/**
 * The server answers 428 with the source conversation when content would
 * leave a different chat than the one it is going into. This turns that into
 * the two-call preview: the agent reads it out, the user agrees, the agent
 * calls again with confirm: true.
 *
 * Honor system, same as delete_message: the in-page confirm dialog cannot
 * outlive the tool-call timeout, so nothing stops an agent from calling
 * again with confirm: true on its own. A server-issued one-time token tied
 * to the preview is the next step.
 */
export async function moveConfirmationPreview(
  res: { status: number; json?: () => Promise<unknown> },
  toolName: string,
  targetTitle: string
): Promise<ModelContextToolResult | null> {
  if (res.status !== 428) return null;

  const data = (await res.json?.().catch(() => null)) as
    | { needsConfirmation?: boolean; source?: { id?: string; name?: string } }
    | null;
  if (!data?.needsConfirmation) return null;

  const sourceName = wrapUntrusted(String(data.source?.name || "another conversation"));
  const sourceId = String(data.source?.id || "unknown");
  return textResult(
    `This content is being moved out of a different conversation: ${sourceName} ` +
      `(id: ${sourceId}), into ${targetTitle}. Ask the user to confirm, then call ` +
      `${toolName} again with confirm: true once they agree.`
  );
}
