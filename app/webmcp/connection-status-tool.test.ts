import { expect, it } from "vitest";
import { createConnectionStatusTool } from "./connection-status-tool";

it("returns a non-sensitive live snapshot", async () => {
  let route = "/";
  const tool = createConnectionStatusTool(() => ({
    authenticated: false,
    state: "SIGNED_OUT",
    route,
    nextAction: "sign_in_on_page",
    guidance: "Sign-in requires the human, not the agent.",
  }));

  expect(tool.name).toBe("get_connection_status");
  expect(tool.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: false,
  });
  const initialResult = await tool.execute({});
  expect(JSON.parse(initialResult.content[0].text)).toEqual({
    authenticated: false,
    state: "SIGNED_OUT",
    route: "/",
    nextAction: "sign_in_on_page",
    guidance: "Sign-in requires the human, not the agent.",
  });

  route = "/conversations";
  const updatedResult = await tool.execute({});
  expect(JSON.parse(updatedResult.content[0].text).route).toBe(
    "/conversations"
  );
});
