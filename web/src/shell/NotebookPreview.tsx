import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BundledLanguage, ThemedToken } from "shiki";
import { highlightCode } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { renderLineTokens } from "./codeViewerRendering";

type NotebookCell = {
  cell_type?: unknown;
  source?: unknown;
  execution_count?: unknown;
  outputs?: unknown;
};

type NotebookOutput = {
  output_type?: unknown;
  name?: unknown;
  text?: unknown;
  data?: unknown;
  ename?: unknown;
  evalue?: unknown;
  traceback?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromNotebookValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((part) => String(part)).join("");
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function mimeData(data: unknown, mime: string): unknown {
  if (!isRecord(data)) return undefined;
  return data[mime];
}

function firstMime(data: unknown, mimes: string[]): { mime: string; value: unknown } | null {
  for (const mime of mimes) {
    const value = mimeData(data, mime);
    if (value !== undefined) return { mime, value };
  }
  return null;
}

function parseNotebook(
  content: string,
): { ok: true; cells: NotebookCell[] } | { ok: false; title: string; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      ok: false,
      title: "Unable to parse notebook",
      message: err instanceof Error ? err.message : "Notebook JSON is invalid.",
    };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.cells)) {
    return {
      ok: false,
      title: "Unsupported notebook",
      message: "This file is valid JSON, but it does not contain a notebook cells array.",
    };
  }

  return { ok: true, cells: parsed.cells as NotebookCell[] };
}

function NotebookError({ title, message }: { title: string; message: string }) {
  return (
    <div className="m-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <div className="font-medium text-destructive">{title}</div>
      <div className="mt-1 text-muted-foreground">{message}</div>
    </div>
  );
}

function CodeBlock({ code, language = "python" }: { code: string; language?: BundledLanguage }) {
  const [tokenLines, setTokenLines] = useState<ThemedToken[][] | null>(null);
  const rawLines = useMemo(() => code.split("\n"), [code]);

  useEffect(() => {
    let cancelled = false;
    setTokenLines(null);
    if (!code) return;
    const cached = highlightCode(code, language, (result) => {
      if (!cancelled) setTokenLines(result.tokens);
    });
    if (cached) setTokenLines(cached.tokens);
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <pre className="overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-5">
      {rawLines.map((line, i) => (
        <div key={i} className="min-h-5 whitespace-pre">
          {tokenLines?.[i] ? renderLineTokens(tokenLines[i], "", false) : line || " "}
        </div>
      ))}
    </pre>
  );
}

function OutputText({
  children,
  tone = "default",
}: {
  children: string;
  tone?: "default" | "error";
}) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border p-3 font-mono text-xs leading-5 whitespace-pre-wrap",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-background",
      )}
    >
      {children}
    </pre>
  );
}

function UnsupportedOutput({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      Unsupported notebook output: <span className="font-mono">{label}</span>
    </div>
  );
}

function ImageOutput({ mime, value }: { mime: string; value: unknown }) {
  const data = textFromNotebookValue(value).trim();
  if (!data) return <UnsupportedOutput label={mime} />;
  const src =
    mime === "image/svg+xml"
      ? `data:${mime};charset=utf-8,${encodeURIComponent(data)}`
      : `data:${mime};base64,${data}`;
  return (
    <div className="overflow-auto rounded-md border border-border bg-background p-3">
      <img src={src} alt={`Notebook output ${mime}`} className="max-h-96 max-w-full" />
    </div>
  );
}

function NotebookOutputView({ output }: { output: NotebookOutput }) {
  const outputType = typeof output.output_type === "string" ? output.output_type : "unknown";

  if (outputType === "stream") {
    return <OutputText>{textFromNotebookValue(output.text)}</OutputText>;
  }

  if (outputType === "error") {
    const parts = [
      textFromNotebookValue(output.ename),
      textFromNotebookValue(output.evalue),
      textFromNotebookValue(output.traceback),
    ].filter(Boolean);
    return <OutputText tone="error">{parts.join("\n")}</OutputText>;
  }

  if (outputType === "execute_result" || outputType === "display_data") {
    const image = firstMime(output.data, ["image/png", "image/jpeg", "image/svg+xml"]);
    if (image) return <ImageOutput mime={image.mime} value={image.value} />;

    const text = mimeData(output.data, "text/plain");
    if (text !== undefined) return <OutputText>{textFromNotebookValue(text)}</OutputText>;

    if (isRecord(output.data)) {
      const firstUnsupported = Object.keys(output.data)[0];
      if (firstUnsupported) return <UnsupportedOutput label={firstUnsupported} />;
    }
  }

  return <UnsupportedOutput label={outputType} />;
}

function NotebookCellView({ cell, index }: { cell: NotebookCell; index: number }) {
  const cellType = typeof cell.cell_type === "string" ? cell.cell_type : "";
  const source = textFromNotebookValue(cell.source);

  if (cellType === "markdown") {
    return (
      <section className="border-b border-border px-6 py-4">
        <div className="prose dark:prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
        </div>
      </section>
    );
  }

  if (cellType === "code") {
    const count =
      typeof cell.execution_count === "number" || typeof cell.execution_count === "string"
        ? String(cell.execution_count)
        : " ";
    const outputs = Array.isArray(cell.outputs) ? (cell.outputs as NotebookOutput[]) : [];
    return (
      <section className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-border px-6 py-4">
        <div className="pt-2 font-mono text-xs text-muted-foreground">In [{count}]</div>
        <div className="min-w-0 space-y-3">
          <CodeBlock code={source} />
          {outputs.length > 0 && (
            <div className="space-y-2">
              {outputs.map((output, outputIndex) => (
                <NotebookOutputView key={outputIndex} output={output} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-border px-6 py-4">
      <NotebookError
        title={`Unsupported notebook cell ${index + 1}`}
        message={cellType ? `Cell type "${cellType}" is not supported.` : "Cell type is missing."}
      />
    </section>
  );
}

export function NotebookPreview({ content }: { content: string }) {
  const parsed = useMemo(() => parseNotebook(content), [content]);

  if (!parsed.ok) {
    return <NotebookError title={parsed.title} message={parsed.message} />;
  }

  return (
    <div className="h-full overflow-auto bg-background">
      {parsed.cells.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">Notebook has no cells.</div>
      ) : (
        parsed.cells.map((cell, index) => (
          <NotebookCellView key={index} cell={cell} index={index} />
        ))
      )}
    </div>
  );
}
