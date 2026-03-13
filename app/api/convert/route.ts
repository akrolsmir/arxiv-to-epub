import { NextRequest, NextResponse } from "next/server";
import { parse } from "node-html-parser";
import epub from "epub-gen-memory";

function extractPaperId(input: string): string | null {
  const trimmed = input.trim();

  // Bare ID: 2301.12345 or 2301.12345v2
  const bareId = trimmed.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/);
  if (bareId) return bareId[1];

  // URL patterns: arxiv.org/abs/ID, arxiv.org/html/ID, arxiv.org/pdf/ID
  const urlMatch = trimmed.match(
    /arxiv\.org\/(?:abs|html|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/
  );
  if (urlMatch) return urlMatch[1];

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Please provide an arXiv URL or paper ID." },
        { status: 400 }
      );
    }

    const paperId = extractPaperId(url);
    if (!paperId) {
      return NextResponse.json(
        {
          error:
            "Could not parse arXiv ID. Use a URL like arxiv.org/abs/2301.12345 or just the ID.",
        },
        { status: 400 }
      );
    }

    // Fetch the HTML version
    const htmlUrl = `https://arxiv.org/html/${paperId}`;
    const response = await fetch(htmlUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          {
            error:
              "This paper doesn't have an HTML version on arXiv. Only papers processed with LaTeXML are available.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `arXiv returned status ${response.status}.` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const root = parse(html);

    // Extract metadata
    const title =
      root.querySelector(".ltx_title")?.text?.replace(/^\s*Title:\s*/i, "") ||
      root.querySelector("h1")?.text ||
      `arXiv:${paperId}`;

    const authorEls = root.querySelectorAll(
      ".ltx_personname, .ltx_role_author"
    );
    const authors =
      authorEls.length > 0
        ? authorEls.map((el) => el.text.trim()).join(", ")
        : "Unknown";

    // Extract abstract
    const abstractEl = root.querySelector(".ltx_abstract");
    const abstractHtml = abstractEl
      ? abstractEl.innerHTML.replace(
          /<h[1-6][^>]*class="[^"]*ltx_title[^"]*"[^>]*>.*?<\/h[1-6]>/i,
          ""
        )
      : "";

    // Extract sections as chapters
    const sections = root.querySelectorAll("section.ltx_section");
    const chapters: { title: string; content: string }[] = [];

    if (abstractHtml) {
      chapters.push({ title: "Abstract", content:abstractHtml });
    }

    if (sections.length > 0) {
      for (const section of sections) {
        const heading = section.querySelector(
          "h2, h3, h4, .ltx_title_section"
        );
        const chapterTitle = heading?.text?.trim() || "Untitled Section";

        // Rewrite relative image URLs to absolute
        let sectionHtml = section.innerHTML;
        sectionHtml = sectionHtml.replace(
          /src="(?!https?:\/\/)(.*?)"/g,
          `src="https://arxiv.org/html/$1"`
        );

        chapters.push({ title: chapterTitle, content:sectionHtml });
      }
    } else {
      // Fallback: use the main article content
      const article = root.querySelector(".ltx_document, article, main");
      if (article) {
        let content = article.innerHTML;
        content = content.replace(
          /src="(?!https?:\/\/)(.*?)"/g,
          `src="https://arxiv.org/html/$1"`
        );
        chapters.push({ title: title, content:content });
      }
    }

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any content from this paper." },
        { status: 422 }
      );
    }

    // Also grab bibliography if present
    const bibSection = root.querySelector(
      "section.ltx_bibliography, .ltx_bibliography"
    );
    if (bibSection) {
      let bibHtml = bibSection.innerHTML;
      bibHtml = bibHtml.replace(
        /src="(?!https?:\/\/)(.*?)"/g,
        `src="https://arxiv.org/html/${paperId}/$1"`
      );
      chapters.push({ title: "References", content:bibHtml });
    }

    const epubCSS = `
      body { font-family: Georgia, serif; line-height: 1.6; margin: 1em; }
      h1, h2, h3, h4 { font-family: Helvetica, Arial, sans-serif; margin-top: 1.5em; }
      figure { margin: 1em 0; text-align: center; }
      figure img { max-width: 100%; height: auto; }
      figcaption { font-size: 0.9em; color: #555; margin-top: 0.5em; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; }
      th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; }
      .ltx_equation { margin: 1em 0; overflow-x: auto; }
      blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #ccc; }
      .ltx_item { display: flex; gap: 0.4em; margin-bottom: 0.5em; }
      .ltx_tag_item { flex-shrink: 0; }
      .ltx_item .ltx_para { display: inline; }
      .ltx_item .ltx_para p { display: inline; }
    `;

    const epubBuffer = await epub(
      {
        title,
        author: authors,
        css: epubCSS,
        version: 3,
        fetchTimeout: 20000,
      },
      chapters
    );

    return new NextResponse(new Uint8Array(epubBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${title.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim()}.epub"`,
      },
    });
  } catch (err) {
    console.error("Conversion error:", err);
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
