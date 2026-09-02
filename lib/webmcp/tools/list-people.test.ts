import { describe, expect, it } from "vitest";

import { listPeople } from "./list-people";
import { createFakeContext, createFakeSupabase, resultText } from "./fake-supabase";

const people = [
  { id: "a-id", name: "Alice", email: "alice@example.org" },
  { id: "b-id", name: "Bob", email: "bob@example.org" },
];

describe("list_people", () => {
  it("lists everyone except me with their online status", async () => {
    const fake = createFakeSupabase({ results: { profiles: [{ data: people }] } });
    const { ctx } = createFakeContext(fake.client, { onlineUserIds: () => ["b-id"] });

    const tool = listPeople(ctx);
    const result = await tool.execute({});

    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(result.isError).toBeUndefined();
    const text = resultText(result);
    expect(text).toContain("(id: a-id) Alice, alice@example.org, offline");
    expect(text).toContain("(id: b-id) Bob, bob@example.org, online");
    expect(fake.opsFor("profiles")).toContainEqual(["neq", ["id", "me-id"]]);
  });

  it("says so when the directory is empty", async () => {
    const fake = createFakeSupabase({ results: { profiles: [{ data: [] }] } });
    const { ctx } = createFakeContext(fake.client);

    const result = await listPeople(ctx).execute({});

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("No one else");
  });
});
