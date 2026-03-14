"use client";

import { useState, useRef } from "react";

type Status = "idle" | "loading" | "error" | "done";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setError("");
    setPaperTitle("");

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : "paper.epub";
      setPaperTitle(filename.replace(".epub", ""));

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);

      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  function reset() {
    setUrl("");
    setStatus("idle");
    setError("");
    setPaperTitle("");
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-sand-50 selection:bg-sand-200">
      {/* Subtle grain texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        {/* Header mark */}
        <div className="mb-16 flex flex-col items-center">
          <div className="mb-6 h-px w-12 bg-sand-400" />
          <h1 className="font-serif text-4xl font-light tracking-tight text-sand-900 sm:text-5xl">
            arxiv to epub
          </h1>
          <p className="mt-3 font-sans text-sm font-light tracking-wide text-sand-500">
            Papers, made readable
          </p>
        </div>

        {/* Main card */}
        <div className="w-full max-w-lg">
          <form onSubmit={handleSubmit} className="group">
            <div
              className={`
                relative overflow-hidden rounded-2xl border transition-all duration-500
                ${status === "error"
                  ? "border-error/40 bg-error-bg shadow-[0_2px_24px_rgba(196,112,90,0.08)]"
                  : status === "done"
                    ? "border-success/40 bg-success-bg shadow-[0_2px_24px_rgba(122,158,126,0.08)]"
                    : "border-sand-300 bg-white shadow-[0_2px_24px_rgba(44,37,32,0.04)] hover:shadow-[0_4px_32px_rgba(44,37,32,0.08)]"
                }
              `}
            >
              {/* Loading bar */}
              {status === "loading" && (
                <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-sand-200">
                  <div
                    className="h-full w-1/3 bg-sand-500"
                    style={{
                      animation: "loading 1.5s ease-in-out infinite",
                    }}
                  />
                </div>
              )}

              <div className="p-6 sm:p-8">
                <label
                  htmlFor="arxiv-url"
                  className="mb-3 block font-sans text-xs font-medium uppercase tracking-[0.15em] text-sand-500"
                >
                  {status === "loading"
                    ? "Converting..."
                    : status === "done"
                      ? "Converted"
                      : "arXiv URL or Paper ID"}
                </label>

                {status === "done" ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <svg
                        className="mt-0.5 h-5 w-5 shrink-0 text-success"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <div>
                        <p className="font-serif text-lg text-sand-900">
                          {paperTitle}.epub
                        </p>
                        <p className="mt-1 font-sans text-sm text-sand-500">
                          Your download should have started automatically.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={reset}
                      className="font-sans text-sm font-medium text-sand-500 underline decoration-sand-300 underline-offset-4 transition-colors hover:text-sand-900 hover:decoration-sand-500"
                    >
                      Convert another paper
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={inputRef}
                      id="arxiv-url"
                      type="text"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        if (status === "error") setStatus("idle");
                      }}
                      placeholder="https://arxiv.org/abs/1706.03762"
                      disabled={status === "loading"}
                      className="w-full border-0 bg-transparent font-serif text-xl text-sand-900 placeholder:text-sand-400 focus:outline-none disabled:opacity-50 sm:text-2xl"
                      autoComplete="off"
                      spellCheck={false}
                    />

                    {status === "error" && (
                      <p className="mt-3 font-sans text-sm text-error">
                        {error}
                      </p>
                    )}

                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="submit"
                        disabled={!url.trim() || status === "loading"}
                        className={`
                          rounded-lg px-5 py-2.5 font-sans text-sm font-medium transition-all duration-300
                          ${!url.trim() || status === "loading"
                            ? "cursor-not-allowed bg-sand-100 text-sand-400"
                            : "bg-sand-900 text-sand-50 shadow-sm hover:bg-sand-950 hover:shadow-md active:scale-[0.98]"
                          }
                        `}
                      >
                        {status === "loading" ? (
                          <span className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                            Working
                          </span>
                        ) : (
                          "Convert"
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-16 font-sans text-xs font-light text-sand-400">
          Made by Austin and Claude.{" "}
          <a
            href="https://github.com/akrolsmir/arxiv-to-epub"
            className="underline decoration-sand-300 underline-offset-2 transition-colors hover:text-sand-500"
          >
            Open source
          </a>
        </p>
      </div>

      <style jsx global>{`
        @keyframes loading {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(200%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}
