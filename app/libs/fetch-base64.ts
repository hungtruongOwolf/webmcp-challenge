import { safeFetch } from "@/app/libs/safe-fetch";

/** Fetches a URL and returns its bytes as base64, for a vision/document API's inline data. */
export async function fetchAsBase64(url: string): Promise<{ data: string; contentType: string }> {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`Could not fetch the file itself (status ${res.status}).`);

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { data, contentType };
}
