import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authenticatedFetch } from "../lib/identity";

export interface BrowserInfo {
  id: string;
  url: string | null;
  title: string | null;
  loading: boolean;
  error: string | null;
  screenshotVersion: number | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export function browsersQueryKey(conversationId: string): readonly unknown[] {
  return ["conversation", conversationId, "browsers"];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function browserInfoFromResource(resource: Record<string, unknown>): BrowserInfo | null {
  const id = resource.id;
  if (typeof id !== "string" || !id) return null;
  const rawMetadata = resource.metadata;
  const metadata =
    rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, unknown>)
      : {};
  return {
    id,
    url: optionalString(metadata.url),
    title: optionalString(metadata.title),
    loading: metadata.loading === true,
    error: optionalString(metadata.error),
    screenshotVersion: optionalNumber(metadata.screenshot_version),
    createdAt: optionalNumber(metadata.created_at),
    updatedAt: optionalNumber(metadata.updated_at),
  };
}

const SOFT_BROWSER_LIST_STATUSES = new Set([404, 409, 502, 503]);

export async function fetchBrowsers(conversationId: string): Promise<BrowserInfo[]> {
  const res = await authenticatedFetch(
    `/v1/sessions/${encodeURIComponent(conversationId)}/resources/browsers?order=asc&limit=1000`,
  );
  if (SOFT_BROWSER_LIST_STATUSES.has(res.status)) return [];
  if (!res.ok) throw new Error(`browsers fetch failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: unknown };
  const rows = Array.isArray(json.data) ? json.data : [];
  const out: BrowserInfo[] = [];
  for (const row of rows) {
    if (row && typeof row === "object") {
      const info = browserInfoFromResource(row as Record<string, unknown>);
      if (info !== null) out.push(info);
    }
  }
  return out;
}

export async function closeBrowser(conversationId: string, browserId: string): Promise<void> {
  const res = await authenticatedFetch(
    `/v1/sessions/${encodeURIComponent(conversationId)}/resources/browsers/${encodeURIComponent(browserId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`browser close failed: ${res.status} ${res.statusText}`);
  }
}

export function browserScreenshotUrl(conversationId: string, browser: BrowserInfo): string | null {
  if (browser.screenshotVersion === null) return null;
  return `/v1/sessions/${encodeURIComponent(conversationId)}/resources/browsers/${encodeURIComponent(browser.id)}/screenshot?v=${encodeURIComponent(String(browser.screenshotVersion))}`;
}

interface UseBrowsersResult {
  browsers: BrowserInfo[];
  isLoading: boolean;
  error: Error | null;
}

export function useBrowsers(conversationId: string | null): UseBrowsersResult {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey:
      conversationId === null
        ? ["conversation", null, "browsers"]
        : browsersQueryKey(conversationId),
    queryFn: async () => {
      const key = browsersQueryKey(conversationId!);
      const fetched = await fetchBrowsers(conversationId!);
      const byId = new Map<string, BrowserInfo>();
      for (const browser of queryClient.getQueryData<BrowserInfo[]>(key) ?? []) {
        byId.set(browser.id, browser);
      }
      for (const browser of fetched) byId.set(browser.id, browser);
      return [...byId.values()];
    },
    enabled: conversationId !== null,
    staleTime: Infinity,
    retry: 1,
  });

  return {
    browsers: data ?? [],
    isLoading,
    error: (error as Error | null) ?? null,
  };
}

export function useCloseBrowser(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (browserId: string) => closeBrowser(conversationId, browserId),
    onSuccess: (_unused, browserId) => {
      const key = browsersQueryKey(conversationId);
      const current = queryClient.getQueryData<BrowserInfo[]>(key);
      if (current === undefined) return;
      queryClient.setQueryData<BrowserInfo[]>(
        key,
        current.filter((browser) => browser.id !== browserId),
      );
    },
  });
}
