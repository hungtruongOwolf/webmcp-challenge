export type ToolApiErrorCode =
  | "AUTH_REQUIRED"
  | "REQUEST_FAILED"
  | "INVALID_RESPONSE";

export class ToolApiError extends Error {
  constructor(
    public readonly code: ToolApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

export type ToolApiClient = {
  request<T>(
    path: string,
    init?: Omit<RequestInit, "credentials" | "signal">
  ): Promise<T>;
};

export type ToolApiClientOptions = {
  signal: AbortSignal;
  onAuthRequired: () => void;
  fetcher?: typeof fetch;
};

export const createToolApiClient = ({
  signal,
  onAuthRequired,
  fetcher = fetch,
}: ToolApiClientOptions): ToolApiClient => ({
  async request<T>(
    path: string,
    init?: Omit<RequestInit, "credentials" | "signal">
  ) {
    const response = await fetcher(path, {
      ...init,
      credentials: "same-origin",
      signal,
    });

    if (response.status === 401) {
      onAuthRequired();
      throw new ToolApiError("AUTH_REQUIRED", "Sign in again.");
    }
    if (!response.ok) {
      throw new ToolApiError(
        "REQUEST_FAILED",
        `Request failed with status ${response.status}.`
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ToolApiError(
        "INVALID_RESPONSE",
        "The server returned an invalid response."
      );
    }
  },
});
