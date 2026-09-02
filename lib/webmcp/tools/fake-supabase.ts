import type { User } from "@supabase/supabase-js";

import type {
  InboxEvent,
  InboxListener,
  SupabaseBrowserClient,
  ToolContext,
} from "@/lib/webmcp/types";

export type FakeResult = { data?: unknown; error?: { message: string } | null };

export type RecordedQuery = { table: string; ops: Array<[string, unknown[]]> };

type BroadcastHandler = (message: { payload: Record<string, unknown> }) => void;

export type FakeChannel = {
  topic: string;
  on: (type: string, filter: unknown, handler: BroadcastHandler) => FakeChannel;
  subscribe: (onStatus?: (status: string) => void) => FakeChannel;
  /** Test hooks: drive the subscription status and deliver broadcasts. */
  setStatus: (status: string) => void;
  broadcast: (payload: Record<string, unknown>) => void;
};

function createFakeChannel(topic: string): FakeChannel {
  const handlers: BroadcastHandler[] = [];
  let onStatus: ((status: string) => void) | undefined;
  const channel: FakeChannel = {
    topic,
    on: (_type, _filter, handler) => {
      handlers.push(handler);
      return channel;
    },
    subscribe: (statusHandler) => {
      onStatus = statusHandler;
      return channel;
    },
    setStatus: (status) => onStatus?.(status),
    broadcast: (payload) => handlers.forEach((handler) => handler({ payload })),
  };
  return channel;
}

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

  const channels: FakeChannel[] = [];
  const removedChannels: FakeChannel[] = [];

  const client = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null, ...(options.rpc?.(name, args) ?? {}) };
    },
    storage: options.storage,
    // realtime-js hands back the channel it already holds for a topic, so a
    // second caller silently shares (and can tear down) the first one's.
    channel: (topic: string) => {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const channel = createFakeChannel(topic);
      channels.push(channel);
      return channel;
    },
    removeChannel: async (channel: FakeChannel) => {
      removedChannels.push(channel);
      return "ok";
    },
  };

  return {
    client: client as unknown as SupabaseBrowserClient,
    queries,
    rpcCalls,
    channels,
    removedChannels,
    /** Returns the recorded ops of the nth query against a table. */
    opsFor: (table: string, index = 0) =>
      queries.filter((q) => q.table === table)[index]?.ops ?? [],
  };
}

export const fakeUser = (id = "me-id"): User =>
  ({ id, email: "me@example.org", user_metadata: { name: "Me" } }) as unknown as User;

/** Stands in for the sidebar's inbox feed: tests flip liveness and push events. */
export function createFakeInbox() {
  const listeners = new Set<InboxListener>();
  let live = false;
  const emit = (event: InboxEvent) => listeners.forEach((listener) => listener(event));

  return {
    subscribeToInbox: (listener: InboxListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isInboxLive: () => live,
    setLive: (next: boolean) => {
      live = next;
      emit({ type: "status", live: next });
    },
    publish: (payload: Record<string, unknown>) => emit({ type: "broadcast", payload }),
    listenerCount: () => listeners.size,
  };
}

export function createFakeContext(
  supabase: SupabaseBrowserClient,
  overrides: Partial<ToolContext> = {}
) {
  const navigated: string[] = [];
  const inbox = createFakeInbox();
  const ctx: ToolContext = {
    supabase,
    currentUser: fakeUser(),
    navigate: (href) => navigated.push(href),
    requestConfirmation: async () => true,
    onlineUserIds: () => [],
    subscribeToInbox: inbox.subscribeToInbox,
    isInboxLive: inbox.isInboxLive,
    ...overrides,
  };
  return { ctx, navigated, inbox };
}

export const resultText = (result: ModelContextToolResult) => result.content[0].text;
