/**
 * Deterministic goal-kind classifier — no LLM call. Per this project's own
 * philosophy (CLAUDE.md: "deterministic code first, AI second"), a one-shot
 * keyword classification doesn't need a model round trip. The "advanced"
 * kind-override in the composer UI exists precisely so a wrong guess here is
 * a one-click fix, not a hard failure.
 */

export type GoalKind = "ephemeral" | "standing" | "routine" | "decision";

const ROUTINE_HINTS = [
  /\bevery day\b/i,
  /\bdaily\b/i,
  /\bevery week\b/i,
  /\bweekly\b/i,
  /\bevery month\b/i,
  /\bmonthly\b/i,
  /\brecurring\b/i,
  /\bon a schedule\b/i,
];

const DECISION_HINTS = [/^should (we|i)\b/i, /\?\s*$/, /\bapprove\b/i, /\bdecide\b/i, /\byes or no\b/i];

const STANDING_HINTS = [
  /\breach\b/i,
  /\bincrease\b/i,
  /\bgrow\b/i,
  /\breduce\b/i,
  /\bcut\b/i,
  /\bimprove\b/i,
  /\bmaintain\b/i,
  /\bkeep .* (above|below|under|over)\b/i,
];

const TITLE_MAX = 120;

export function classifyGoal(raw: string): {
  kind: GoalKind;
  title: string;
  description: string | null;
} {
  const text = raw.trim();
  const title = text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
  const description = text.length > TITLE_MAX ? text : null;

  let kind: GoalKind = "ephemeral";
  if (ROUTINE_HINTS.some((re) => re.test(text))) kind = "routine";
  else if (DECISION_HINTS.some((re) => re.test(text))) kind = "decision";
  else if (STANDING_HINTS.some((re) => re.test(text))) kind = "standing";

  return { kind, title, description };
}

export const KIND_HINTS: Record<GoalKind, string> = {
  ephemeral: "one-shot — runs once and closes",
  standing: "ongoing — measured by key results",
  routine: "scheduled — fires on a cadence",
  decision: "needs your call — approve or decline",
};

export const GOAL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  achieved: "Achieved",
  archived: "Archived",
};

export const GOAL_STATUS_DOT: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  active: "bg-chart-2",
  paused: "bg-chart-3",
  achieved: "bg-primary",
  archived: "bg-muted-foreground/25",
};
