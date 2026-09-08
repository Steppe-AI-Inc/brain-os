// VERIFIER #62 FINDINGS V62-D2 (P1), V62-D3 (P2), V62-D5 (P3).
//
// V62-D2 is mine, introduced one round ago while closing V61-D10. The model-context gate counted an image as
// `base64.length / 4` — that is the estimator for TEXT, and an image is not text. Measured: a 512 KB photo
// scored 208,651 "tokens" and was refused, a 1 MB photo 383,414, while the web client accepts 5 MB and v92
// serves those turns without complaint. So closing an unmeasured gate introduced a brand-new UNSAFE HARD
// STOP — the precise thing the founder's §2 forbids — on a shape v92 handles.
//
// The correct accounting: an image's cost to a vision model is a function of its dimensions, not of its
// base64 length, and this function cannot know the dimensions. So the image is removed from the TOKEN
// estimate entirely (v92 parity restored) and bounded by the only limit that is actually knowable and
// actually enforced by the provider: its SIZE IN BYTES. Anthropic's per-image limit is 5 MB, which is also
// what the web client already allows, so the gate now refuses exactly what the provider would refuse and
// nothing else.
//
// V62-D3: contextBudget.note told the model that any entity it named is resolved server-side. That is true
// for companies, people, tasks and goals — the four with targeted lookups — and false for the other fifteen
// collections, including projects, which the pinned incident witness question is about. A note that
// overstates the guarantee is worse than no note: it invites exactly the confident wrong answer this whole
// contract exists to prevent.
//
// V62-D5: the command is serialized TWICE (top level, and inside currentTurn), but the "which input was too
// big" ternary compared one copy against half the cap — so a 22,000-character paste was refused with "this
// workspace has grown", blaming the founder's data for the founder's own message.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D2: the image leaves the token estimate.
must(`function estimateRequestTokens(payload: unknown, imageBase64: string | null): number {
  // null, 2 is what streamAnthropic and streamOpenAI both serialize with.
  const body = JSON.stringify(payload, null, 2) || '';
  // A base64 image is billed as image tokens, not characters; its transported size is what matters for the
  // request, and it is counted here rather than left as an unnamed input.
  const imageTokens = imageBase64 ? Math.ceil(imageBase64.length / 4) : 0;
  return SYSTEM_PROMPT_TOKENS + Math.ceil(body.length / 4) + imageTokens;
}`,
`function estimateRequestTokens(payload: unknown): number {
  // null, 2 is what streamAnthropic and streamOpenAI both serialize with.
  const body = JSON.stringify(payload, null, 2) || '';
  return SYSTEM_PROMPT_TOKENS + Math.ceil(body.length / 4);
}
// An image's cost to a vision model is a function of its DIMENSIONS, which this function cannot know;
// base64 length is not a token count and using it as one refused ordinary photos that v92 serves
// (verifier #62, V62-D2). What IS knowable is the transported size, and that is what the provider itself
// limits — 5 MB per image for Anthropic, which is also what the web client allows.
const IMAGE_BYTES_MAX = Number(Deno.env.get('SEM_AI_IMAGE_BYTES_MAX') || 5 * 1024 * 1024);
function imageBytes(base64: string): number {
  // 4 base64 characters carry 3 bytes; padding makes this an over-estimate by at most 2 bytes.
  return Math.ceil((base64.length * 3) / 4);
}`, 'image estimator');

must(`    const requestTokens = estimateRequestTokens(
      { profile: { id: profile.id, role: profile.role }, command, contextPack },
      attachedImage ? attachedImage.base64 : null);`,
`    const requestTokens = estimateRequestTokens({ profile: { id: profile.id, role: profile.role }, command, contextPack });
    if (attachedImage && imageBytes(attachedImage.base64) > IMAGE_BYTES_MAX) {
      return json({
        error: 'Request too large',
        limit: 'attached image size',
        reason: 'that image is larger than the ' + Math.round(IMAGE_BYTES_MAX / (1024 * 1024)) + ' MB the model accepts — send a smaller or more compressed image, or ask without it',
        imageBytes: imageBytes(attachedImage.base64),
        imageBytesMax: IMAGE_BYTES_MAX,
        note: 'Nothing was changed. This is a refusal to run the turn, not a failure of an operation.',
      }, 413);
    }`, 'image gate');

must(`        reason: attachedImage
          ? 'the attached image is too large to send with this turn — attach a smaller image, or ask without it'
          : 'this turn is too large for the model to read in one request — ask about one company or one area at a time',
        requestTokens,
        systemPromptTokens: SYSTEM_PROMPT_TOKENS,
        imageAttached: !!attachedImage,`,
`        reason: 'this turn is too large for the model to read in one request — ask about one company or one area at a time',
        requestTokens,
        systemPromptTokens: SYSTEM_PROMPT_TOKENS,
        imageAttached: !!attachedImage,`, 'window reason');

// ---- D5: the command is counted twice, so the attribution must count it twice too.
must(`      const commandTokens = estimateTokens(command);`,
`      // The command is serialized TWICE — at the top level and inside contextPack.currentTurn — so its real
      // contribution is double what a single copy measures. Comparing one copy blamed the workspace for a
      // 22,000-character paste (verifier #62, V62-D5).
      const commandTokens = estimateTokens(command) * 2;`, 'command tokens');

// ---- D3: the note claims only what is true.
must(`    note: 'A trimmed collection is truncated, never absent: its envelope in context.collections keeps the real total and truncated=true, and any entity named in a command is still resolved server-side across every status.',`,
`    note: 'A trimmed collection is truncated, never absent: its envelope in context.collections keeps the real total and truncated=true, and the ids the trim dropped are listed in that envelope as droppedIds. Companies, people, tasks and goals named in a command are additionally re-read server-side across every status and appear in context.namedTargets; for other collections a trimmed window is a window, so say what you can see and do not conclude that anything is absent from the database.',`, 'note');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.includes('estimateRequestTokens(payload: unknown, imageBase64')) throw new Error('old estimator signature survived');
writeFileSync(p, out); console.log('applied', n);
