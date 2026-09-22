// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  cleanExtractedResumeText,
  extractResumeText,
  formatExtractionCatalog,
  insufficientTextFailureCode,
  meaningfulCharacterCount,
  pdfDataUrl,
  resolveMammothExtractRawText,
  shouldUsePdfVisionFallback,
} from "./resumeActions";

async function docxWithText(text: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return await zip.generateAsync({ type: "uint8array" });
}

function pdfWithText(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/gu, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("CV text extraction", () => {
  it("reads actual text from a DOCX body", async () => {
    const bytes = await docxWithText(
      "E-commerce Manager with Shopify and WooCommerce experience",
    );
    const text = await extractResumeText(
      new Blob([Uint8Array.from(bytes)]),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(text).toContain("E-commerce Manager");
    expect(text).toContain("Shopify");
  });

  it("supports Mammoth's CommonJS default export in the Convex bundle", async () => {
    const extractRawText = vi.fn().mockResolvedValue({ value: "טקסט תקין" });
    const resolved = resolveMammothExtractRawText({
      default: { extractRawText },
    });
    await expect(resolved({ buffer: Buffer.from("fixture") })).resolves.toEqual(
      { value: "טקסט תקין" },
    );
    expect(extractRawText).toHaveBeenCalledOnce();
  });

  it("reads actual text from a PDF content stream", async () => {
    const bytes = pdfWithText("Product Manager with analytics experience");
    const text = await extractResumeText(new Blob([bytes]), "application/pdf");
    expect(text).toContain("Product Manager");
    expect(text).toContain("analytics");
  });

  it("detects PDF bytes even when the browser MIME is generic", async () => {
    const bytes = pdfWithText("Operations Manager with ecommerce experience");
    const text = await extractResumeText(
      new Blob([bytes]),
      "application/octet-stream",
    );
    expect(text).toContain("Operations Manager");
  });

  it("counts Hebrew letters as meaningful CV content", () => {
    expect(
      meaningfulCharacterCount("ניהול מסחר אלקטרוני Shopify"),
    ).toBeGreaterThan(20);
  });

  it("does not reject a scanned PDF as empty", () => {
    expect(insufficientTextFailureCode("pdf", " \n ")).toBeNull();
    expect(insufficientTextFailureCode("docx", " \n ")).toBe(
      "EMPTY_EXTRACTED_TEXT",
    );
    expect(
      insufficientTextFailureCode(
        "pdf",
        "ניסיון מקצועי משמעותי בניהול מסחר אלקטרוני ופיתוח אתרים Shopify",
      ),
    ).toBeNull();
  });

  it("routes image-only PDFs to the model file input", () => {
    expect(shouldUsePdfVisionFallback("pdf", " \n ")).toBe(true);
    expect(shouldUsePdfVisionFallback("docx", " \n ")).toBe(false);
    expect(pdfDataUrl(new Uint8Array([1, 2, 3]).buffer)).toBe(
      "data:application/pdf;base64,AQID",
    );
  });

  it("formats existing roles, skills, and aliases as extraction references", () => {
    const catalog = formatExtractionCatalog([
      {
        kind: "jobTitle",
        labelEn: "Data Entry Clerk",
        labelHe: "קלדן נתונים",
        aliases: ["מקליד נתונים"],
      },
      {
        kind: "skill",
        labelEn: "Fast Typing",
        labelHe: "הקלדה מהירה",
        aliases: ["מקליד מהר"],
      },
    ]);
    expect(catalog).toContain("Data Entry Clerk | קלדן נתונים");
    expect(catalog).toContain("Fast Typing | הקלדה מהירה");
    expect(catalog).toContain("aliases: מקליד מהר");
  });

  it("rejects malformed DOCX bytes and keeps empty extraction visibly empty", async () => {
    await expect(
      extractResumeText(
        new Blob(["not a docx"]),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).rejects.toThrow();
    expect(cleanExtractedResumeText(" \n \u0000 ")).toBe("");
  });
});
