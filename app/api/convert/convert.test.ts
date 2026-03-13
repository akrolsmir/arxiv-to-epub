import { describe, test, expect } from "bun:test";

// Extract the core logic into testable pieces by importing the route
// and calling it as a function with a mocked Request

const ROUTE_URL = "http://localhost/api/convert";

async function callConvert(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const request = new Request(ROUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request as any);
}

describe("extractPaperId via API", () => {
  test("rejects empty input", async () => {
    const res = await callConvert({ url: "" });
    expect(res.status).toBe(400);
  });

  test("rejects garbage input", async () => {
    const res = await callConvert({ url: "not a real url" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Could not parse");
  });

  test("rejects missing body", async () => {
    const res = await callConvert({});
    expect(res.status).toBe(400);
  });

  test("accepts bare paper ID", async () => {
    const res = await callConvert({ url: "2301.12345" });
    // Should not be a 400 — it parsed the ID. Could be 404 if paper has no HTML.
    expect(res.status).not.toBe(400);
  });

  test("accepts abs URL", async () => {
    const res = await callConvert({ url: "https://arxiv.org/abs/2301.12345" });
    expect(res.status).not.toBe(400);
  });

  test("accepts html URL", async () => {
    const res = await callConvert({ url: "https://arxiv.org/html/2301.12345" });
    expect(res.status).not.toBe(400);
  });

  test("accepts versioned ID", async () => {
    const res = await callConvert({ url: "2301.12345v2" });
    expect(res.status).not.toBe(400);
  });
});

describe("end-to-end conversion", () => {
  test("converts a real paper to epub", async () => {
    const res = await callConvert({ url: "https://arxiv.org/abs/2603.11353" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/epub+zip");
    expect(res.headers.get("Content-Disposition")).toContain(".epub");

    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(1000);

    // EPUB files are ZIP archives — they start with PK magic bytes
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
  }, 60000);
});
