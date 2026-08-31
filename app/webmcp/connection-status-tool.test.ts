import { expect, it } from "vitest";
import { createConnectionStatusTool } from "./connection-status-tool";

it("returns a non-sensitive live snapshot", async () => {
  let route = "/";
  const tool = createConnectionStatusTool(() => ({
    authenticated: false,
    state: "SIGNED_OUT",
    route,
    nextAction: "sign_in_on_page",
  }));

  expect(tool.name).toBe("get_connection_status");
  expect(tool.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: false,
  });
  expect(
    JSON.parse(
      await tool.execute({}, { signal: new AbortController().signal })
    )
  ).toEqual({
    authenticated: false,
    state: "SIGNED_OUT",
    route: "/",
    nextAction: "sign_in_on_page",
  });

  route = "/conversations";
  expect(
    JSON.parse(
      await tool.execute({}, { signal: new AbortController().signal })
    ).route
  ).toBe("/conversations");
});
