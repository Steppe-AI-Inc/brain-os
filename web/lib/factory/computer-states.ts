// The derived computer states the Factory reports (contract §3; factory._computer_view / _principal_state). The page only labels
// and colours them - it never computes a state. An unknown state is shown verbatim, never hidden or mapped to a guess.

export type Tone = "good" | "busy" | "warn" | "bad" | "idle";

export const COMPUTER_STATES: Record<string, { label: string; tone: Tone; hint: string }> = {
  UNENROLLED: { label: "Unenrolled", tone: "idle", hint: "No pairing code and no credential." },
  PAIRING_CODE_ISSUED: { label: "Pairing code issued", tone: "warn", hint: "Waiting for the code to be entered in BrainFactorySetup.exe." },
  PAIRING_STARTED: { label: "Pairing started", tone: "warn", hint: "The code was entered; the computer is proving its key." },
  PAIRING_EXPIRED: { label: "Pairing code expired", tone: "bad", hint: "Issue a new code." },
  PAIRING_REVOKED: { label: "Pairing code revoked", tone: "bad", hint: "Issue a new code." },
  PAIRING_CONSUMED: { label: "Pairing code used", tone: "idle", hint: "The code was used once and can never be used again." },
  NODE_CREDENTIAL_ISSUED: { label: "Credential issued", tone: "warn", hint: "Enrolled; the runtime is being installed." },
  RUNTIME_INSTALLING: { label: "Installing runtime", tone: "warn", hint: "The runtime is being installed on the computer." },
  INSTALL_FAILED: { label: "Install failed", tone: "bad", hint: "Setup names the failed step and retries with the same credential." },
  REGISTERING: { label: "Registering", tone: "warn", hint: "The runtime is registering with the Factory." },
  REGISTRATION_FAILED: { label: "Registration failed", tone: "bad", hint: "The runtime could not register (see the reason)." },
  ALIVE: { label: "Alive", tone: "good", hint: "Registered and heartbeating." },
  AVAILABLE: { label: "Available", tone: "good", hint: "Heartbeating and ready for work." },
  CLAIMING: { label: "Claiming", tone: "busy", hint: "Taking a work order." },
  BUSY: { label: "Busy", tone: "busy", hint: "Running work." },
  CHECKPOINTING: { label: "Checkpointing", tone: "busy", hint: "Saving a checkpoint." },
  COMPLETING: { label: "Completing", tone: "busy", hint: "Finishing a run." },
  RECOVERING: { label: "Recovering", tone: "warn", hint: "Restarted; reconciling its runs." },
  DRAINING: { label: "Draining", tone: "warn", hint: "Takes no new work; resume to restore it." },
  STALE: { label: "Stale", tone: "warn", hint: "No heartbeat for more than 3 minutes." },
  OFFLINE: { label: "Offline", tone: "bad", hint: "No heartbeat for more than 30 minutes (a logon-only task is offline until the user signs in)." },
  CREDENTIAL_REVOKED: { label: "Credential revoked", tone: "bad", hint: "Every call from this credential is refused. Re-pair to issue a new key." },
  ARCHIVED: { label: "Archived", tone: "idle", hint: "Does no work. History stays readable. Restore requires a re-pair." },
};

export function stateInfo(state: string | null | undefined) {
  if (!state) return { label: "Unknown", tone: "idle" as Tone, hint: "The Factory reported no state." };
  return COMPUTER_STATES[state] ?? { label: state, tone: "idle" as Tone, hint: "A state this page does not know; shown as the Factory reported it." };
}

export const TONE_CLASS: Record<Tone, string> = {
  good: "border-chart-2/30 bg-chart-2/15 text-chart-2",
  busy: "border-primary/25 bg-primary/10 text-primary",
  warn: "border-chart-3/30 bg-chart-3/15 text-chart-3",
  bad: "border-destructive/30 bg-destructive/15 text-destructive",
  idle: "border-border bg-muted text-muted-foreground",
};

/** a server-reported age in seconds as words; the age itself always comes from the Factory's clock */
export function ageText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
