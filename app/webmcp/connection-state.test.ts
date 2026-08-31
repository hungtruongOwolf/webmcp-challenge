import { describe, expect, it } from "vitest";
import {
  connectionMessage,
  connectionReducer,
  initialConnectionState,
} from "./connection-state";

describe("connectionReducer", () => {
  it("moves a signed-in user to connected", () => {
    const ready = connectionReducer(initialConnectionState, {
      type: "SESSION_READY",
      userId: "user-a",
    });
    const registering = connectionReducer(ready, {
      type: "TOOLS_REGISTERING",
      userId: "user-a",
    });
    const connected = connectionReducer(registering, {
      type: "TOOLS_CONNECTED",
      userId: "user-a",
    });
    expect(connected).toEqual({ status: "CONNECTED", userId: "user-a" });
    expect(connectionMessage(connected)).toBe(
      "Signed in. Messenger connected."
    );
  });

  it("represents unavailable, failed, expired, and signed-out states", () => {
    expect(
      connectionReducer(initialConnectionState, {
        type: "TOOLS_UNAVAILABLE",
        userId: "user-a",
      }).status
    ).toBe("SIGNED_IN_TOOLS_UNAVAILABLE");
    expect(
      connectionReducer(initialConnectionState, {
        type: "TOOLS_FAILED",
        userId: "user-a",
      }).status
    ).toBe("SIGNED_IN_TOOLS_FAILED");
    expect(
      connectionReducer(initialConnectionState, { type: "SESSION_EXPIRED" })
        .status
    ).toBe("SESSION_EXPIRED");
    expect(
      connectionReducer(
        { status: "CONNECTED", userId: "user-a" },
        { type: "SIGNED_OUT" }
      )
    ).toEqual(initialConnectionState);
  });
});
