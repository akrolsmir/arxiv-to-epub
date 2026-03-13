# arxiv-to-epub plan

Build a Next.js (App Router) web app that converts arXiv papers to EPUB using arXiv's HTML rendering.

## Stack

Next.js 16+ (App Router), TypeScript, Tailwind CSS.

Libraries: `epub-gen-memory`, `node-html-parser`.

## Architecture — 2 pieces

### 1. Frontend (`app/page.tsx`)

- Single-page app with an input field for arXiv URL (accepts formats: `arxiv.org/abs/XXXX.XXXXX`, `arxiv.org/html/XXXX.XXXXX`, or just the paper ID)
- Submit button → calls API route → streams back EPUB as file download
- Show loading state, error handling for papers without HTML versions
- Clean minimal design with Tailwind

### 2. API Route (`app/api/convert/route.ts`)

- Extract paper ID from the URL input (handle `abs/`, `html/`, `pdf/` URL patterns and bare IDs, including versioned IDs like `2301.12345v2`)
- Fetch `https://arxiv.org/html/{paperID}`
- Parse with node-html-parser:
  - Extract title from `<h1>` or `.ltx_title`
  - Extract authors from `.ltx_authors` or `.ltx_personname`
  - Extract abstract from `.ltx_abstract`
  - Split body into chapters by top-level `<section>` elements (arXiv HTML uses `<section class="ltx_section">`)
  - For each chapter, extract heading text as chapter title and inner HTML as chapter content
  - Rewrite all relative image `src` URLs to absolute `https://arxiv.org/html/{paperID}/...` URLs
  - Strip arXiv navigation chrome (header, footer, sidebar)
  - Preserve MathML as-is (EPUB3 supports it)
- Generate EPUB using `epub-gen-memory`:
  ```ts
  {
    title: extractedTitle,
    author: extractedAuthors,
    content: chapters.map(ch => ({ title: ch.title, data: ch.html })),
    css: readabilityCSS, // minimal CSS for good e-reader display
    version: 3
  }
  ```
- Return the buffer with `Content-Type: application/epub+zip` and `Content-Disposition: attachment; filename="{paperID}.epub"`

## Implementation notes

- arXiv HTML classes use the `ltx_` prefix (from LaTeXML): `ltx_title`, `ltx_authors`, `ltx_section`, `ltx_abstract`, `ltx_figure`, `ltx_equation`, etc.
- Some papers don't have HTML versions — check for 404 and return a clear error.
- Add a small custom CSS string for the EPUB that handles basic typography, figure sizing, and table display for e-readers.
- Set appropriate `fetchTimeout` in epub-gen-memory options since arXiv images can be slow.
- The API route may take 5-15 seconds for image-heavy papers — show a progress indicator on the frontend.
- Math: arXiv HTML uses MathML (via LaTeXML). EPUB3 supports MathML natively. Pass it through as-is for v1. If e-reader compat becomes an issue later, add a MathML→SVG render step.

## Test papers

Validate against a few papers from different fields to shake out LaTeXML output variations:

- An ML paper (e.g. `2301.12345`)
- A math-heavy paper
- A physics paper with lots of figures