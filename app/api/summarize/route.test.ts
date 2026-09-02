// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/app/libs/supabase/server";
import { generateWithClaude } from "@/app/libs/anthropic";
import { POST } from "./route";

vi.mock("@/app/libs/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/libs/anthropic", () => ({ generateWithClaude: vi.fn() }));
vi.mock("@/app/libs/gemini", () => ({ generateWithGemini: vi.fn() }));

type RecordedOp = [string, unknown[]];

const query = { ops: [] as RecordedOp[], result: { data: [] as unknown[], error: null } };

/** Records every chained call; filters are not interpreted. */
const createQueryChain = () => {
  const target: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(query.result).then(resolve, reject),
  };
  const chain: unknown = new Proxy(target, {
    get: (obj, prop: string) => {
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        query.ops.push([prop, args]);
        return chain;
      };
    },
  });
  return chain;
};

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://verb.example/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  query.ops = [];
  query.result = {
    data: [
      {
        body: "see you at 7",
        image: null,
        file_name: null,
        created_at: "2026-09-02T09:00:00.000Z",
        sender: { name: "Grace" },
      },
    ],
    error: null,
  };
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.mocked(generateWithClaude).mockResolvedValue("They agreed to meet at 7.");
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "me-id" } } }) },
    from: () => createQueryChain(),
  } as never);
});

describe("POST /api/summarize", () => {
  it("leaves soft-deleted messages out of the transcript", async () => {
    const response = await call({ conversationId: "conv-1" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: "They agreed to meet at 7." });
    expect(query.ops).toContainEqual(["eq", ["conversation_id", "conv-1"]]);
    expect(query.ops).toContainEqual(["is", ["deleted_at", null]]);
  });
});
