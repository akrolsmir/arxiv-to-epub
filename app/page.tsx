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

      // Extract filename from Content-Disposition
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
    <div className="min-h-screen bg-[#FAF8F5] selection:bg-[#E8DDD3]">
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
          <div className="mb-6 h-px w-12 bg-[#C4B5A4]" />
          <h1 className="font-serif text-4xl font-light tracking-tight text-[#2C2520] sm:text-5xl">
            arxiv to epub
          </h1>
          <p className="mt-3 font-sans text-sm font-light tracking-wide text-[#8C7E6F]">
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
                  ? "border-[#C4705A]/40 bg-[#FDF6F4] shadow-[0_2px_24px_rgba(196,112,90,0.08)]"
                  : status === "done"
                    ? "border-[#7A9E7E]/40 bg-[#F6FAF6] shadow-[0_2px_24px_rgba(122,158,126,0.08)]"
                    : "border-[#DDD5CA] bg-white shadow-[0_2px_24px_rgba(44,37,32,0.04)] hover:shadow-[0_4px_32px_rgba(44,37,32,0.08)]"
                }
              `}
            >
              {/* Loading bar */}
              {status === "loading" && (
                <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[#E8DDD3]">
                  <div
                    className="h-full w-1/3 bg-[#8C7E6F]"
                    style={{
                      animation: "loading 1.5s ease-in-out infinite",
                    }}
                  />
                </div>
              )}

              <div className="p-6 sm:p-8">
                <label
                  htmlFor="arxiv-url"
                  className="mb-3 block font-sans text-xs font-medium uppercase tracking-[0.15em] text-[#8C7E6F]"
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
                        className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#7A9E7E]"
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
                        <p className="font-serif text-lg text-[#2C2520]">
                          {paperTitle}.epub
                        </p>
                        <p className="mt-1 font-sans text-sm text-[#8C7E6F]">
                          Your download should have started automatically.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={reset}
                      className="font-sans text-sm font-medium text-[#8C7E6F] underline decoration-[#DDD5CA] underline-offset-4 transition-colors hover:text-[#2C2520] hover:decoration-[#8C7E6F]"
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
                      placeholder="arxiv.org/abs/2301.12345"
                      disabled={status === "loading"}
                      className="w-full border-0 bg-transparent font-serif text-xl text-[#2C2520] placeholder:text-[#C4B5A4] focus:outline-none disabled:opacity-50 sm:text-2xl"
                      autoComplete="off"
                      spellCheck={false}
                    />

                    {status === "error" && (
                      <p className="mt-3 font-sans text-sm text-[#C4705A]">
                        {error}
                      </p>
                    )}

                    <div className="mt-6 flex items-center justify-between">
                      <p className="font-sans text-xs text-[#C4B5A4]">
                        Paste a link or paper ID
                      </p>
                      <button
                        type="submit"
                        disabled={!url.trim() || status === "loading"}
                        className={`
                          rounded-lg px-5 py-2.5 font-sans text-sm font-medium transition-all duration-300
                          ${!url.trim() || status === "loading"
                            ? "cursor-not-allowed bg-[#F0EBE4] text-[#C4B5A4]"
                            : "bg-[#2C2520] text-[#FAF8F5] shadow-sm hover:bg-[#1A1512] hover:shadow-md active:scale-[0.98]"
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
        <p className="mt-16 font-sans text-xs font-light text-[#C4B5A4]">
          Uses arXiv HTML renders. Not all papers are available.
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
