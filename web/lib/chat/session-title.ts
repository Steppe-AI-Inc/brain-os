const GENERIC_TITLES = new Set([
  "new chat",
  "new conversation",
  "general",
  "conversation",
  "chat",
  "brain os",
  "command executed",
]);

function clean(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[`*_#>~]/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function commandFallback(command: string): string {
  const words = clean(command)
    .replace(/^(hey|hi|hello|please|can you|could you|i need|we need)\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 7);
  const candidate = words.join(" ");
  return candidate || "Untitled conversation";
}

export function normalizeSessionTitle(
  aiTitle: string | null | undefined,
  summary: string | null | undefined,
  command: string
): string {
  const title = clean(aiTitle);
  const summaryTitle = clean(summary).split(/[.!?]/)[0] ?? "";
  const candidate =
    title && !GENERIC_TITLES.has(title.toLowerCase())
      ? title
      : summaryTitle && !GENERIC_TITLES.has(summaryTitle.toLowerCase())
        ? summaryTitle
        : commandFallback(command);

  const words = candidate.split(" ").filter(Boolean).slice(0, 8);
  const compact = words.join(" ").slice(0, 72).trim();
  return compact || "Untitled conversation";
}
