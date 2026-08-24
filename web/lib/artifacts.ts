export const ARTIFACT_BUCKET = "company-artifacts";
export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
};

const MIME_ALIASES: Record<string, string> = {
  "application/x-pdf": "application/pdf",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

export const ALLOWED_ARTIFACT_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

export function canonicalArtifactMime(fileName: string, reportedType?: string | null) {
  const reported = (reportedType || "").split(";")[0].trim().toLowerCase();
  const normalized = MIME_ALIASES[reported] || reported;
  if (ALLOWED_ARTIFACT_MIME_TYPES.has(normalized)) return normalized;

  const extension = fileName.toLowerCase().split(".").pop() || "";
  return MIME_BY_EXTENSION[extension] || null;
}

export function sanitizeArtifactFileName(fileName: string) {
  return (
    fileName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-160) || "artifact"
  );
}

export function artifactValidationError(file: File) {
  if (!file.size) return "Choose a non-empty file.";
  if (file.size > MAX_ARTIFACT_BYTES) return "Artifact exceeds the 25 MB limit.";
  if (!canonicalArtifactMime(file.name, file.type)) {
    return "Unsupported file type. Upload PDF, DOCX, XLSX, TXT, MD, CSV, JSON, PNG, JPG/JPEG or WEBP.";
  }
  return null;
}
