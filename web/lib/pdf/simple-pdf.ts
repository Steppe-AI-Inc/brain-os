// Minimal, dependency-free single-page-capable PDF writer. No external PDF library —
// hand-rolled PDF 1.4 object structure with a Helvetica text stream. Good enough for a
// text-only business document (quotations, simple reports); not a general PDF engine —
// no images, no embedded fonts, no multi-column layout.
//
// Usage: build a list of lines with a font size (12 = body, 16 = heading, 20 = title),
// call renderPdf(), get back a Buffer ready to upload or return as a download.

export type PdfLine = { text: string; size?: number; gapAfter?: number; bold?: boolean };

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 56;
const MARGIN_TOP = 56;
const LINE_HEIGHT_FACTOR = 1.35;

function escapePdfText(s: string): string {
  // Helvetica/WinAnsi in this writer only covers Latin-1 (0x00-0xFF). Anything outside
  // that (em dashes, curly quotes, non-Latin scripts) doesn't crash — Buffer's latin1
  // encoding just silently keeps the low byte of each UTF-16 unit, corrupting the
  // glyph — so replace it with a safe fallback instead of shipping garbled text.
  const safe = s.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const ascii = Array.from(safe)
    .map((ch) => (ch.codePointAt(0)! > 0xff ? "?" : ch))
    .join("");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderPdf(lines: PdfLine[]): Buffer {
  const streamParts: string[] = ["BT"];
  let y = PAGE_HEIGHT - MARGIN_TOP;
  let currentFont: "F1" | "F2" | null = null;
  let currentSize = -1;

  for (const line of lines) {
    const size = line.size ?? 12;
    const font = line.bold ? "F2" : "F1";
    if (font !== currentFont || size !== currentSize) {
      streamParts.push(`/${font} ${size} Tf`);
      currentFont = font;
      currentSize = size;
    }
    streamParts.push(`1 0 0 1 ${MARGIN_LEFT} ${Math.round(y)} Tm`);
    streamParts.push(`(${escapePdfText(line.text)}) Tj`);
    y -= size * LINE_HEIGHT_FACTOR + (line.gapAfter ?? 0);
  }
  streamParts.push("ET");
  const content = streamParts.join("\n");
  const contentBytes = Buffer.from(content, "latin1");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 6 0 R >>"
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const streamObj = `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`;
  objects.push(streamObj);

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [0];
  let runningLength = chunks[0].length;

  objects.forEach((obj, i) => {
    offsets.push(runningLength);
    const objBuf = Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, "latin1");
    chunks.push(objBuf);
    runningLength += objBuf.length;
  });

  const xrefOffset = runningLength;
  const xrefLines: string[] = [`xref`, `0 ${objects.length + 1}`, `0000000000 65535 f `];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }
  xrefLines.push(`trailer`, `<< /Size ${objects.length + 1} /Root 1 0 R >>`, `startxref`, `${xrefOffset}`, `%%EOF`);
  chunks.push(Buffer.from(xrefLines.join("\n"), "latin1"));

  return Buffer.concat(chunks);
}
