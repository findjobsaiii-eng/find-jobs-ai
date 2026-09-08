export function processingErrorKey(error: unknown) {
  const data =
    error && typeof error === "object" && "data" in error ? error.data : null;
  const code =
    data && typeof data === "object" && "code" in data
      ? String(data.code)
      : error instanceof Error && error.message === "upload_failed"
        ? "UPLOAD_FAILED"
        : null;
  if (code === "FILE_TOO_LARGE") return "tooLarge";
  if (code === "SCANNED_PDF") return "scannedPdf";
  if (code === "EMPTY_FILE" || code === "EMPTY_EXTRACTED_TEXT") return "empty";
  if (code === "CV_AI_PARSE_FAILED" || code === "CV_SCHEMA_INVALID")
    return "parsing";
  if (
    code === "PDF_PARSE_FAILED" ||
    code === "DOCX_PARSE_FAILED" ||
    code === "ENCRYPTED_PDF" ||
    code === "UNSUPPORTED_FILE_TYPE" ||
    code === "UNSUPPORTED_MIME"
  )
    return "invalid";
  return "upload";
}
