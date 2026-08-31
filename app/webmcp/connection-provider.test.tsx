import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebMCPModelContext, WebMCPTool } from "./browser-api";
import {
  WebMCPConnectionProvider,
  useWebMCPConnection,
} from "./connection-provider";
import { ConnectionStatusIndicator } from "./connection-status-indicator";
import type { WebMCPToolRegistry } from "./tool-registry";

const navigation = vi.hoisted(() => ({ pathname: "/conversations" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const ConnectionProbe = () => {
  const connection = useWebMCPConnection();
  return (
    <>
      <output>{connection.message}</output>
      <button type="button" onClick={connection.reportSessionExpired}>
        Expire session
      </button>
    </>
  );
};

const CatalogInstaller = ({ tools }: { tools: WebMCPTool[] }) => {
  const { replaceAuthenticatedTools } = useWebMCPConnection();

  useEffect(() => {
    replaceAuthenticatedTools(tools);
    return () => replaceAuthenticatedTools([]);
  }, [replaceAuthenticatedTools, tools]);

  return null;
};

const createFakeModelContext = () => {
  const registrations: Array<{
    name: string;
    tool: WebMCPTool;
    aborted: boolean;
  }> = [];
  const context: WebMCPModelContext = {
    registerTool: async (tool, options) => {
      const registration = { name: tool.name, tool, aborted: false };
      registrations.push(registration);
      options?.signal?.addEventListener(
        "abort",
        () => {
          registration.aborted = true;
        },
        { once: true }
      );
    },
  };
  return Object.assign(context, {
    activeNames: () =>
      registrations.filter((item) => !item.aborted).map((item) => item.name),
    abortedRegistrationCount: () =>
      registrations.filter((item) => item.aborted).length,
    registrationCount: () => registrations.length,
    activeTools: () => registrations.filter((item) => !item.aborted),
  });
};

const toolResult = (value: unknown): ModelContextToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const parseToolResult = (result: ModelContextToolResult) =>
  JSON.parse(result.content[0].text);

const createStubTool = (name: string): WebMCPTool => ({
  name,
  description: `${name} test tool`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  execute: async () => toolResult({ ok: true }),
});

const lifecycleTestRegistry: WebMCPToolRegistry = {
  getPublicTools: ({ getSnapshot }) => [
    {
      ...createStubTool("get_connection_status"),
      execute: async () => toolResult(getSnapshot()),
    },
  ],
  getAuthenticatedTools: () => [
    createStubTool("get_connection_status"),
    createStubTool("test_authenticated_messenger_action"),
  ],
};

describe("WebMCPConnectionProvider", () => {
  beforeEach(() => {
    navigation.pathname = "/conversations";
  });

  it("server-renders and hydrates an authenticated session without signed-out state", async () => {
    const modelContext = createFakeModelContext();
    const tree = (
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="server-validated-user"
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    const serverHtml = renderToString(tree);

    expect(serverHtml).toContain("Signed in. Connecting Messenger…");
    expect(serverHtml).not.toContain("Sign in required.");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);
    const observedText: string[] = [];
    const observer = new MutationObserver(() => {
      observedText.push(container.textContent ?? "");
    });
    observer.observe(container, { childList: true, subtree: true });

    const root = hydrateRoot(container, tree);
    await waitFor(() =>
      expect(container).toHaveTextContent("Signed in. Messenger connected.")
    );
    observer.disconnect();

    expect(observedText).not.toContain(expect.stringContaining("Sign in required."));
    root.unmount();
    container.remove();
  });

  it("replaces public tools with authenticated tools and aborts on sign-out", async () => {
    const modelContext = createFakeModelContext();
    const { rerender } = render(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId={null}
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Sign in required.");
    expect(modelContext.activeNames()).toEqual(["get_connection_status"]);

    rerender(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Signed in. Messenger connected.");
    expect(modelContext.abortedRegistrationCount()).toBe(1);
    expect(modelContext.activeNames()).toEqual([
      "get_connection_status",
      "test_authenticated_messenger_action",
    ]);

    rerender(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId={null}
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Sign in required.");
    expect(modelContext.abortedRegistrationCount()).toBe(3);
    expect(modelContext.activeNames()).toEqual(["get_connection_status"]);
  });

  it("keeps one tool scope and does not re-announce when the same user rerenders", async () => {
    const modelContext = createFakeModelContext();
    const { rerender } = render(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
      >
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );

    const liveRegion = await screen.findByRole("status");
    await waitFor(() =>
      expect(liveRegion).toHaveTextContent("Signed in. Messenger connected.")
    );
    const announcements: string[] = [];
    const observer = new MutationObserver(() => {
      announcements.push(liveRegion.textContent ?? "");
    });
    observer.observe(liveRegion, { childList: true, subtree: true });

    rerender(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
      >
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await act(async () => Promise.resolve());
    observer.disconnect();

    expect(modelContext.activeNames()).toEqual([
      "get_connection_status",
      "test_authenticated_messenger_action",
    ]);
    expect(announcements).toEqual([]);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("registers one status tool plus the complete authenticated Messenger catalog", async () => {
    const modelContext = createFakeModelContext();
    const catalogNames = [
      "list_conversations",
      "read_conversation",
      "search_messages",
      "search_people",
      "get_my_profile",
      "open_conversation",
      "create_group",
      "draft_message",
      "send_message",
      "delete_conversation",
      "describe_image",
      "read_file",
      "read_link",
    ];
    const catalogTools = [
      createStubTool("get_connection_status"),
      ...catalogNames.map(createStubTool),
    ];
    const renderTree = (currentUserId: string | null) => (
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId={currentUserId}
      >
        <CatalogInstaller tools={catalogTools} />
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    const { rerender } = render(renderTree("user-a"));

    await waitFor(() =>
      expect(modelContext.activeNames()).toEqual([
        "get_connection_status",
        ...catalogNames,
      ])
    );
    const settledRegistrationCount = modelContext.registrationCount();

    rerender(renderTree("user-a"));
    await act(async () => Promise.resolve());
    expect(modelContext.registrationCount()).toBe(settledRegistrationCount);

    rerender(renderTree(null));
    await waitFor(() =>
      expect(modelContext.activeNames()).toEqual(["get_connection_status"])
    );
    expect(modelContext.abortedRegistrationCount()).toBe(
      settledRegistrationCount
    );
  });

  it("aborts the old user before registering the new user and ignores stale completion", async () => {
    const StateProbe = () => {
      const { state } = useWebMCPConnection();
      return <output aria-label="connected user">{state.userId}</output>;
    };
    const events: string[] = [];
    let releaseUserA: (() => void) | undefined;
    const userAPending = new Promise<void>((resolve) => {
      releaseUserA = resolve;
    });
    const context: WebMCPModelContext = {
      registerTool: async (tool, options) => {
        events.push(`register:${tool.name}`);
        options?.signal?.addEventListener(
          "abort",
          () => events.push(`abort:${tool.name}`),
          { once: true }
        );
        if (tool.name === "user-a-tool") await userAPending;
      },
    };
    let scope = 0;
    const registry: WebMCPToolRegistry = {
      getPublicTools: () => [],
      getAuthenticatedTools: () => [
        createStubTool(scope++ === 0 ? "user-a-tool" : "user-b-tool"),
      ],
    };
    const { rerender } = render(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-a"
        registry={registry}
      >
        <ConnectionProbe />
        <StateProbe />
      </WebMCPConnectionProvider>
    );
    await waitFor(() => expect(events).toEqual(["register:user-a-tool"]));

    rerender(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-b"
        registry={registry}
      >
        <ConnectionProbe />
        <StateProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Signed in. Messenger connected.");
    expect(events).toEqual([
      "register:user-a-tool",
      "abort:user-a-tool",
      "register:user-b-tool",
    ]);

    releaseUserA?.();
    await act(async () => Promise.resolve());
    expect(screen.getByText("Signed in. Messenger connected.")).toBeVisible();
    expect(screen.getByRole("status", { name: "connected user" })).toHaveTextContent(
      "user-b"
    );
  });

  it("updates the connection snapshot route without registering another scope", async () => {
    navigation.pathname = "/conversations";
    let statusTool: WebMCPTool | undefined;
    const context: WebMCPModelContext = {
      registerTool: async (tool) => {
        statusTool = tool;
      },
    };
    const registry: WebMCPToolRegistry = {
      getPublicTools: () => [],
      getAuthenticatedTools: ({ getSnapshot }) => [
        {
          ...createStubTool("get_connection_status"),
          execute: async () => toolResult(getSnapshot()),
        },
      ],
    };
    const { rerender } = render(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-a"
        registry={registry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Signed in. Messenger connected.");

    navigation.pathname = "/users";
    rerender(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-a"
        registry={registry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );

    const result = await statusTool?.execute({});
    expect(parseToolResult(result!)).toMatchObject({
      route: "/users",
      state: "CONNECTED",
      authenticated: true,
    });
  });

  it("aborts every partial registration when one authenticated tool rejects", async () => {
    const registrations: Array<{ name: string; aborted: boolean }> = [];
    const context: WebMCPModelContext = {
      registerTool: async (tool, options) => {
        const registration = { name: tool.name, aborted: false };
        registrations.push(registration);
        options?.signal?.addEventListener(
          "abort",
          () => {
            registration.aborted = true;
          },
          { once: true }
        );
        if (tool.name === "test_authenticated_messenger_action") {
          throw new Error("registration rejected");
        }
      },
    };

    render(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );

    await screen.findByText("Signed in. Agent tools could not connect.");
    expect(registrations).toEqual([
      { name: "get_connection_status", aborted: true },
      { name: "test_authenticated_messenger_action", aborted: true },
    ]);
  });

  it("shows the degraded-browser state without attempting registration", async () => {
    render(
      <WebMCPConnectionProvider
        modelContext={null}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );

    expect(
      await screen.findByText(
        "Signed in. Messenger is ready; agent tools are unavailable in this browser."
      )
    ).toBeVisible();
  });

  it("aborts active tools, clears the local session once, and announces expiry", async () => {
    const modelContext = createFakeModelContext();
    const clearSession = vi.fn(async () => undefined);
    render(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
        clearSession={clearSession}
      >
        <ConnectionProbe />
      </WebMCPConnectionProvider>
    );
    await screen.findByText("Signed in. Messenger connected.");

    fireEvent.click(screen.getByRole("button", { name: "Expire session" }));

    await screen.findByText(
      "Your session expired. Nothing was sent. Sign in again."
    );
    expect(modelContext.activeNames()).toEqual([]);
    expect(modelContext.abortedRegistrationCount()).toBe(2);
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("retains session expiry when local sign-out publishes a signed-out user", async () => {
    const modelContext = createFakeModelContext();
    const ExpiryActions = () => {
      const { beginAuthentication, reportSessionExpired } =
        useWebMCPConnection();
      return (
        <>
          <button type="button" onClick={reportSessionExpired}>
            Expire session
          </button>
          <button type="button" onClick={beginAuthentication}>
            Begin authentication
          </button>
        </>
      );
    };
    const { rerender } = render(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
        clearSession={async () => undefined}
      >
        <ExpiryActions />
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Signed in. Messenger connected."
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Expire session" }));
    rerender(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId={null}
        registry={lifecycleTestRegistry}
        clearSession={async () => undefined}
      >
        <ExpiryActions />
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );

    await act(async () => Promise.resolve());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session expired. Nothing was sent. Sign in again."
    );
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/?next=%2Fconversations"
    );
    await waitFor(() =>
      expect(modelContext.activeNames()).toEqual(["get_connection_status"])
    );
    expect(modelContext.registrationCount()).toBe(3);

    const [publicStatus] = modelContext.activeTools();
    const payload = await publicStatus.tool.execute({});
    expect(parseToolResult(payload)).toMatchObject({
      authenticated: false,
      state: "SESSION_EXPIRED",
      route: "/conversations",
      nextAction: "sign_in_on_page",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Begin authentication" })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Signing in…");
    expect(
      screen.queryByRole("link", { name: "Sign in again" })
    ).not.toBeInTheDocument();
  });

  it("consumes local sign-out rejection while preserving session expiry", async () => {
    const modelContext = createFakeModelContext();
    let rejectCleanup: ((reason: Error) => void) | undefined;
    const cleanupPromise = new Promise<void>((_resolve, reject) => {
      rejectCleanup = reject;
    });
    const catchCleanupRejection = vi.spyOn(cleanupPromise, "catch");
    void cleanupPromise.then(undefined, () => undefined);
    const clearSession = vi.fn(() => cleanupPromise);
    const ExpireButton = () => {
      const { reportSessionExpired } = useWebMCPConnection();
      return (
        <button type="button" onClick={reportSessionExpired}>
          Expire session
        </button>
      );
    };
    render(
      <WebMCPConnectionProvider
        modelContext={modelContext}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
        clearSession={clearSession}
      >
        <ExpireButton />
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Signed in. Messenger connected."
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Expire session" }));
    rejectCleanup?.(new Error("storage unavailable"));
    await act(async () => Promise.resolve());

    expect(catchCleanupRejection).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session expired. Nothing was sent. Sign in again."
    );
    expect(screen.getByRole("link", { name: "Sign in again" })).toBeVisible();
    expect(modelContext.activeNames()).toEqual([]);
    expect(modelContext.registrationCount()).toBe(2);
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("announces authentication through the single live region", async () => {
    const AuthenticationProbe = () => {
      const { beginAuthentication } = useWebMCPConnection();
      return (
        <button type="button" onClick={beginAuthentication}>
          Begin authentication
        </button>
      );
    };
    render(
      <WebMCPConnectionProvider
        modelContext={createFakeModelContext()}
        currentUserId={null}
        registry={lifecycleTestRegistry}
      >
        <AuthenticationProbe />
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Sign in required.")
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Begin authentication" })
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Signing in…");
  });

  it("retries a failed authenticated registration with one replacement scope", async () => {
    const modelContext = createFakeModelContext();
    let attempt = 0;
    const registry: WebMCPToolRegistry = {
      getPublicTools: () => [],
      getAuthenticatedTools: () => {
        attempt += 1;
        if (attempt === 1) {
          return [
            {
              ...createStubTool("failed-tool"),
              name: "failed-tool",
            },
          ];
        }
        return [createStubTool("connected-tool")];
      },
    };
    const context: WebMCPModelContext = {
      registerTool: async (tool, options) => {
        await modelContext.registerTool(tool, options);
        if (tool.name === "failed-tool") throw new Error("first attempt");
      },
    };
    render(
      <WebMCPConnectionProvider
        modelContext={context}
        currentUserId="user-a"
        registry={registry}
      >
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await screen.findByRole("button", { name: "Retry agent connection" });
    expect(screen.getByText("Connection failed")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry agent connection" })
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Signed in. Messenger connected."
      )
    );
    expect(modelContext.activeNames()).toEqual(["connected-tool"]);
  });

  it("renders an expiry link for the current safe return path", async () => {
    const ExpiryHarness = () => {
      const [expired, setExpired] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setExpired(true)}>
            Show provider
          </button>
          {expired ? <ConnectionProbe /> : null}
        </>
      );
    };
    render(
      <WebMCPConnectionProvider
        modelContext={createFakeModelContext()}
        currentUserId="user-a"
        registry={lifecycleTestRegistry}
        clearSession={async () => undefined}
      >
        <ExpiryHarness />
        <ConnectionStatusIndicator />
      </WebMCPConnectionProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Signed in. Messenger connected."
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Show provider" }));
    fireEvent.click(screen.getByRole("button", { name: "Expire session" }));

    expect(
      await screen.findByRole("link", { name: "Sign in again" })
    ).toHaveAttribute("href", "/?next=%2Fconversations");
    expect(screen.getByText("Session expired")).toBeVisible();
  });
});
