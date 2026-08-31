import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type CapturedTool = {
  name: string;
  execute: (
    input: Record<string, unknown>,
    agent?: ModelContextAgent
  ) => Promise<ModelContextToolResult>;
};

type CapturedRegistration = CapturedTool & {
  registrationId: number;
};

type RegistrationEvent = {
  order: number;
  type: "register" | "abort";
  registrationId: number;
  name: string;
};

type WebMCPTestSurface = {
  tools: CapturedRegistration[];
  abortCount: number;
  events: RegistrationEvent[];
};

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

if (!email || !password) {
  throw new Error(
    "E2E_USER_EMAIL and E2E_USER_PASSWORD must identify a disposable Supabase test account."
  );
}

const installWebMCPTestSurface = async (page: Page) => {
  await page.addInitScript(() => {
    const surface: WebMCPTestSurface = {
      tools: [],
      abortCount: 0,
      events: [],
    };
    let nextRegistrationId = 0;
    let nextEventOrder = 0;
    Object.defineProperty(window, "__webmcpTest", { value: surface });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(
          tool: CapturedTool,
          options?: { signal?: AbortSignal }
        ) {
          const registration: CapturedRegistration = {
            ...tool,
            registrationId: ++nextRegistrationId,
          };
          surface.tools.push(registration);
          surface.events.push({
            order: ++nextEventOrder,
            type: "register",
            registrationId: registration.registrationId,
            name: registration.name,
          });
          options?.signal?.addEventListener(
            "abort",
            () => {
              surface.events.push({
                order: ++nextEventOrder,
                type: "abort",
                registrationId: registration.registrationId,
                name: registration.name,
              });
              surface.tools = surface.tools.filter(
                ({ registrationId }) =>
                  registrationId !== registration.registrationId
              );
              surface.abortCount += 1;
            },
            { once: true }
          );
        },
      },
    });
  });
};

const connectionStatus = async (page: Page) =>
  page.evaluate(async () => {
    const surface = (
      window as unknown as Window & { __webmcpTest: WebMCPTestSurface }
    ).__webmcpTest;
    const tools = surface.tools.filter(
      (candidate) => candidate.name === "get_connection_status"
    );
    if (tools.length !== 1) {
      throw new Error(
        `Expected exactly one get_connection_status registration, found ${tools.length}.`
      );
    }
    const [tool] = tools;
    const output = await tool.execute({});
    return JSON.parse(output.content[0].text) as Record<string, unknown>;
  });

const expectNoSeriousAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical"
    )
  ).toEqual([]);
};

const signInWithPassword = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page).toHaveURL(/\/conversations$/);
};

test("signed-out authentication is keyboard accessible and has no serious axe violations", async ({
  page,
}) => {
  await installWebMCPTestSurface(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with password" })
  ).toBeVisible();

  const supportsPasskeys = await page.evaluate(
    () => typeof window.PublicKeyCredential !== "undefined"
  );
  const firstButton = page.getByRole("button").first();
  if (supportsPasskeys) {
    await expect(firstButton).toHaveAccessibleName("Sign in with a passkey");
  }

  await page.keyboard.press("Tab");
  await expect(firstButton).toBeFocused();
  const focusStyle = await firstButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");

  await expectNoSeriousAxeViolations(page);

  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expectNoSeriousAxeViolations(page);
});

test("public connection status is signed out and contains no identity or token data", async ({
  page,
}) => {
  await installWebMCPTestSurface(page);
  await page.goto("/");

  await expect
    .poll(() => connectionStatus(page))
    .toEqual({
      authenticated: false,
      state: "SIGNED_OUT",
      route: "/",
      nextAction: "sign_in_on_page",
    });
});

test("password sign-in focuses Conversations, announces connection, and authenticates the status tool", async ({
  page,
}) => {
  await installWebMCPTestSurface(page);
  await signInWithPassword(page);

  const heading = page.getByRole("heading", { name: "Conversations" });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    "Signed in. Messenger connected."
  );
  await expect.poll(() => connectionStatus(page)).toMatchObject({
    authenticated: true,
    state: "CONNECTED",
  });
  await expectNoSeriousAxeViolations(page);
});

test("logout aborts the authenticated registration before restoring the public status tool", async ({
  page,
}) => {
  await installWebMCPTestSurface(page);
  await signInWithPassword(page);
  await expect.poll(() => connectionStatus(page)).toMatchObject({
    authenticated: true,
    state: "CONNECTED",
  });
  const authenticatedRegistration = await page.evaluate(() => {
    const surface = (
      window as unknown as Window & { __webmcpTest: WebMCPTestSurface }
    ).__webmcpTest;
    const registrations = surface.tools.filter(
      ({ name }) => name === "get_connection_status"
    );
    if (registrations.length !== 1) {
      throw new Error(
        `Expected one authenticated status registration, found ${registrations.length}.`
      );
    }
    return {
      registrationId: registrations[0].registrationId,
      baselineEventOrder: surface.events.at(-1)?.order ?? 0,
    };
  });

  await page.getByRole("button", { name: "Your profile" }).click();
  await page
    .getByRole("dialog", { name: "Your profile" })
    .getByRole("button", { name: "Log out" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Log out" })
    .getByRole("button", { name: "Log out" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => connectionStatus(page)).toEqual({
    authenticated: false,
    state: "SIGNED_OUT",
    route: "/",
    nextAction: "sign_in_on_page",
  });
  await expect
    .poll(() =>
      page.evaluate(({ oldRegistrationId, baselineEventOrder }) => {
        const surface = (
          window as unknown as Window & { __webmcpTest: WebMCPTestSurface }
        ).__webmcpTest;
        const activeStatusTools = surface.tools.filter(
          ({ name }) => name === "get_connection_status"
        );
        const replacement = activeStatusTools[0];
        const postBaselineStatusEvents = surface.events.filter(
          (event) =>
            event.order > baselineEventOrder &&
            event.name === "get_connection_status"
        );

        return {
          authenticatedRegistrationAbsent: !surface.tools.some(
            ({ registrationId }) => registrationId === oldRegistrationId
          ),
          exactlyOneActiveStatusTool: activeStatusTools.length === 1,
          replacementHasNewId:
            replacement !== undefined &&
            replacement.registrationId !== oldRegistrationId,
          postBaselineStatusSequence: postBaselineStatusEvents.map((event) => {
            const generation =
              event.registrationId === oldRegistrationId
                ? "authenticated"
                : event.registrationId === replacement?.registrationId
                  ? "replacement"
                  : "other";
            return `${event.type}:${generation}`;
          }),
        };
      }, {
        oldRegistrationId: authenticatedRegistration.registrationId,
        baselineEventOrder: authenticatedRegistration.baselineEventOrder,
      })
    )
    .toEqual({
      authenticatedRegistrationAbsent: true,
      exactlyOneActiveStatusTool: true,
      replacementHasNewId: true,
      postBaselineStatusSequence: [
        "abort:authenticated",
        "register:replacement",
      ],
    });
  await expectNoSeriousAxeViolations(page);
});

test("Messenger remains operable after sign-in without the browser WebMCP API", async ({
  page,
}) => {
  await signInWithPassword(page);

  await expect(page.getByRole("status")).toHaveText(
    "Signed in. Messenger is ready; agent tools are unavailable in this browser."
  );
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeFocused();
  await expect(
    page.getByRole("heading", {
      name: "Select a chat or start a new conversation.",
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test("protected passkey enrollment exposes keyboard controls and skip uses a validated destination", async ({
  page,
}) => {
  await installWebMCPTestSurface(page);
  await signInWithPassword(page);
  await page.goto("/auth/passkey?next=/users");

  const enroll = page.getByRole("button", { name: "Set up passkey" });
  const skip = page.getByRole("button", { name: "Maybe later" });
  await expect(enroll).toBeVisible();
  await expect(skip).toBeVisible();
  await enroll.focus();
  await expect(enroll).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expectNoSeriousAxeViolations(page);

  await skip.press("Enter");
  await expect(page).toHaveURL(/\/users$/);
});
