import type { User } from "@supabase/supabase-js";

import type { SupabaseBrowserClient, ToolContext } from "@/lib/webmcp/types";

export type FakeResult = { data?: unknown; error?: { message: string } | null };

export type RecordedQuery = { table: string; ops: Array<[string, unknown[]]> };

/**
 * A stand-in for the browser client: every from(table) call pops the next
 * queued result for that table, and every chained call is recorded so a test
 * can assert on the filters a tool applied. Filters are not interpreted.
 */
export function createFakeSupabase(options: {
  results?: Record<string, FakeResult[]>;
  rpc?: (name: string, args: Record<string, unknown>) => FakeResult;
  storage?: Record<string, unknown>;
} = {}) {
  const queues = new Map<string, FakeResult[]>(
    Object.entries(options.results ?? {}).map(([table, results]) => [table, [...results]])
  );
  const queries: RecordedQuery[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const from = (table: string) => {
    const recorded: RecordedQuery = { table, ops: [] };
    queries.push(recorded);
    const result = queues.get(table)?.shift() ?? { data: null, error: null };

    const builder: Record<string, unknown> = {
      then: (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject),
    };
    const chain = new Proxy(builder, {
      get: (target, prop: string) => {
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          recorded.ops.push([prop, args]);
          return chain;
        };
      },
    });
    return chain;
  };

  const client = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null, ...(options.rpc?.(name, args) ?? {}) };
    },
    storage: options.storage,
  };

  return {
    client: client as unknown as SupabaseBrowserClient,
    queries,
    rpcCalls,
    /** Returns the recorded ops of the nth query against a table. */
    opsFor: (table: string, index = 0) =>
      queries.filter((q) => q.table === table)[index]?.ops ?? [],
  };
}

export const fakeUser = (id = "me-id"): User =>
  ({ id, email: "me@example.org", user_metadata: { name: "Me" } }) as unknown as User;

export function createFakeContext(
  supabase: SupabaseBrowserClient,
  overrides: Partial<ToolContext> = {}
) {
  const navigated: string[] = [];
  const ctx: ToolContext = {
    supabase,
    currentUser: fakeUser(),
    navigate: (href) => navigated.push(href),
    requestConfirmation: async () => true,
    onlineUserIds: () => [],
    ...overrides,
  };
  return { ctx, navigated };
}

export const resultText = (result: ModelContextToolResult) => result.content[0].text;
