import {
  AlertCircleIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  MonitorIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  browserScreenshotUrl,
  browsersQueryKey,
  type BrowserInfo,
  useCloseBrowser,
} from "@/hooks/useBrowsers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BrowserPanelProps {
  conversationId: string;
  browsers: BrowserInfo[];
}

function browserLabel(browser: BrowserInfo): string {
  return browser.title ?? browser.url ?? browser.id;
}

function browserStatus(browser: BrowserInfo): {
  label: string;
  className: string;
  icon: ReactNode;
} {
  if (browser.error) {
    return {
      label: "Error",
      className: "bg-destructive/10 text-destructive",
      icon: <AlertCircleIcon className="size-3" />,
    };
  }
  if (browser.loading) {
    return {
      label: "Loading",
      className: "bg-muted text-muted-foreground",
      icon: <Loader2Icon className="size-3 animate-spin" />,
    };
  }
  return {
    label: "Ready",
    className: "bg-success/15 text-success",
    icon: <span className="size-1.5 rounded-full bg-current" />,
  };
}

export function BrowserPanel({ conversationId, browsers }: BrowserPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const queryClient = useQueryClient();
  const selected = useMemo(
    () => browsers.find((browser) => browser.id === selectedId) ?? browsers[0] ?? null,
    [browsers, selectedId],
  );
  const closeBrowser = useCloseBrowser(conversationId);
  const baseScreenshotUrl = selected ? browserScreenshotUrl(conversationId, selected) : null;
  const screenshotUrl =
    baseScreenshotUrl === null
      ? null
      : `${baseScreenshotUrl}&r=${encodeURIComponent(refreshToken)}`;
  const status = selected ? browserStatus(selected) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {browsers.length > 1 && (
        <div className="shrink-0 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
          <div className="flex gap-1">
            {browsers.map((browser) => (
              <button
                key={browser.id}
                type="button"
                className={cn(
                  "flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                  selected?.id === browser.id && "bg-muted text-foreground",
                )}
                onClick={() => setSelectedId(browser.id)}
              >
                <GlobeIcon className="size-3.5 shrink-0" />
                <span className="truncate">{browserLabel(browser)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-start gap-2">
              <GlobeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{browserLabel(selected)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {selected.url ?? selected.id}
                </div>
              </div>
              {status && (
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[11px] font-medium",
                    status.className,
                  )}
                >
                  {status.icon}
                  {status.label}
                </span>
              )}
            </div>
            {selected.error && (
              <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                {selected.error}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            <div className="flex aspect-video min-h-40 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
              {screenshotUrl ? (
                <img
                  src={screenshotUrl}
                  alt={selected.title ?? selected.url ?? "Browser screenshot"}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <MonitorIcon className="size-8" />
                  <span className="text-xs">No screenshot yet</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh browser screenshot"
                disabled={!screenshotUrl}
                onClick={() => {
                  setRefreshToken((prev) => prev + 1);
                  void queryClient.invalidateQueries({
                    queryKey: browsersQueryKey(conversationId),
                  });
                }}
              >
                <RefreshCwIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-w-0 flex-1 justify-start gap-2"
                disabled={!selected.url}
                asChild={!!selected.url}
              >
                {selected.url ? (
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon className="size-4 shrink-0" />
                    <span className="truncate">Open URL</span>
                  </a>
                ) : (
                  <>
                    <ExternalLinkIcon className="size-4 shrink-0" />
                    <span className="truncate">Open URL</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close browser"
                disabled={closeBrowser.isPending}
                onClick={() => closeBrowser.mutate(selected.id)}
              >
                {closeBrowser.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <XIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
          No browser resources
        </div>
      )}
    </div>
  );
}
