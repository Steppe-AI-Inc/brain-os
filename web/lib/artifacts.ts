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


export type ArtifactCompanyOption = {
  id: string;
  name: string;
  legal_entity_name?: string | null;
  country?: string | null;
  aliases?: string[] | null;
};

function normalizedMatchText(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestArtifactCompany(
  input: { title?: string; fileName?: string; notes?: string },
  companies: ArtifactCompanyOption[]
): { companyId: string; confidence: number; reason: string } | null {
  const haystack = normalizedMatchText(
    [input.title, input.fileName, input.notes].filter(Boolean).join(" ")
  );
  if (!haystack || companies.length === 0) return null;

  const scored = companies
    .map((company) => {
      const candidates = [
        { value: company.name, weight: 7, label: company.name },
        { value: company.legal_entity_name, weight: 7, label: company.legal_entity_name },
        ...(company.aliases || []).map((alias) => ({ value: alias, weight: 10, label: alias })),
        { value: company.country, weight: 2, label: company.country },
      ].filter((candidate): candidate is { value: string; weight: number; label: string } =>
        typeof candidate.value === "string" && candidate.value.trim().length > 1
      );

      let score = 0;
      const matches: string[] = [];
      for (const candidate of candidates) {
        const normalized = normalizedMatchText(candidate.value);
        if (!normalized) continue;
        if (haystack.includes(normalized)) {
          score += candidate.weight;
          matches.push(candidate.label);
          continue;
        }
        const meaningfulTokens = normalized.split(" ").filter((token) => token.length >= 4);
        const tokenMatches = meaningfulTokens.filter((token) => haystack.includes(token));
        if (tokenMatches.length) {
          score += Math.min(candidate.weight - 1, tokenMatches.length * 2);
          matches.push(...tokenMatches);
        }
      }
      return { company, score, matches: [...new Set(matches)] };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 3 || top.score === second?.score) return null;

  const margin = top.score - (second?.score || 0);
  const confidence = Math.min(0.99, Math.max(0.55, 0.52 + top.score * 0.035 + margin * 0.02));
  return {
    companyId: top.company.id,
    confidence,
    reason: `Matched ${top.matches.slice(0, 3).join(", ") || top.company.name} in the title, filename or notes.`,
  };
}
