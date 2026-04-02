export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: HeadersInit;
  fetchImpl?: typeof fetch;
}

export interface ApiClientRequestInit extends RequestInit {
  jsonBody?: unknown;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function createApiClient(config: ApiClientConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ? trimTrailingSlash(config.baseUrl) : "";

  async function request<TResponse>(
    path: string,
    init: ApiClientRequestInit = {}
  ): Promise<TResponse> {
    const targetPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${baseUrl}${targetPath}`;
    const headers: HeadersInit = {
      ...(config.defaultHeaders ?? {}),
      ...(init.headers ?? {}),
      ...(init.jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
    };
    const response = await fetchImpl(url, {
      ...init,
      headers,
      body:
        init.jsonBody !== undefined ? JSON.stringify(init.jsonBody) : init.body,
    });
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ error: `${response.status} ${response.statusText}` }));
      throw new Error(
        typeof errorBody?.error === "string"
          ? errorBody.error
          : `Request failed: ${response.status}`
      );
    }
    if (response.status === 204) return undefined as TResponse;
    return (await response.json()) as TResponse;
  }

  return { request };
}
