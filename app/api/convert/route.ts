import { NextRequest, NextResponse } from "next/server";
import { parse, type HTMLElement } from "node-html-parser";
import epub from "epub-gen-memory";

/**
 * Post-process a section's HTML to fix LaTeXML structures for epub rendering:
 * - Footnotes: convert hidden inline spans to visible superscript notes
 * - Citations: strip broken cross-chapter #id links, keep visible text
 * - Bibliography: handled via CSS (flexbox on ltx_bibitem)
 */
function postProcessHtml(html: string): string {
  const root = parse(html);

  // --- Footnotes ---
  // LaTeXML footnotes are: <span class="ltx_note ltx_role_footnote">
  //   <sup class="ltx_note_mark">1</sup>
  //   <span class="ltx_note_outer"><span class="ltx_note_content">...text...</span></span>
  // </span>
  // Convert to: <sup>1</sup><span class="epub_footnote"> [text]</span>
  for (const note of root.querySelectorAll(".ltx_note")) {
    const mark = note.querySelector(".ltx_note_mark");
    const content = note.querySelector(".ltx_note_content");
    if (mark && content) {
      // Get the footnote text, stripping the duplicate mark and type label inside
      const innerMarks = content.querySelectorAll(".ltx_note_mark, .ltx_note_type, .ltx_tag_note");
      for (const m of innerMarks) m.remove();
      const footnoteText = content.text.trim();
      if (footnoteText) {
        note.replaceWith(
          `<sup>${mark.text}</sup><span class="epub_footnote"> [${footnoteText}]</span>`
        );
      }
    }
  }

  // --- Citations ---
  // LaTeXML citations: <cite class="ltx_cite"><a href="#bib.bib13">13</a></cite>
  // or: <cite class="ltx_cite">[<a href="#bib.bib13">13</a>, <a href="#bib.bib5">5</a>]</cite>
  // The #id links break across epub chapters. Replace <a> with plain text.
  for (const cite of root.querySelectorAll(".ltx_cite")) {
    for (const anchor of cite.querySelectorAll("a.ltx_ref")) {
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#")) {
        anchor.replaceWith(`<span class="epub_cite_ref">${anchor.text}</span>`);
      }
    }
  }

  return root.innerHTML;
}

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
      chapters.push({ title: "Abstract", content: postProcessHtml(abstractHtml) });
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
        sectionHtml = postProcessHtml(sectionHtml);

        chapters.push({ title: chapterTitle, content: sectionHtml });
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
        content = postProcessHtml(content);
        chapters.push({ title: title, content: content });
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
      .epub_footnote { font-size: 0.85em; color: #555; }
      .epub_cite_ref { }
      .ltx_bibitem { display: flex; gap: 0.5em; margin-bottom: 0.75em; }
      .ltx_tag_bibitem { flex-shrink: 0; font-weight: 600; }
      .ltx_bibblock { display: inline; }
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
