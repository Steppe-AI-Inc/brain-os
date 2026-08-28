SCENARIO ID: SC-135-explicit-new-chat-creates-new-session

PURPOSE: The restore-on-navigate fix (SC-134) must not fight an explicit "New chat" click
— that must always land on a genuinely blank conversation, never silently reopen the
previous one. This is the counterpart regression: fixing "chat forgets everything" the
naive way (always restore on any bare `/chat` load) would break "start fresh" instead.

ACTOR: any logged-in user.

ORGANIZATION: n/a.

ROLE: any.

CAPABILITIES: n/a.

PRECONDITIONS: an active, remembered conversation exists in `sessionStorage`
(`brainos.chat.activeChannelId`).

ACTION: with Chat A active, click "New chat" (both instances in
`app/(app)/chat/channel-sidebar.tsx`, now `href="/chat?new=1"` instead of the ambiguous
bare `/chat`).

EXPECTED RESULT: a genuinely blank composer, no history, `activeChannelId` is `null`.
`ChatClient`'s restore effect sees `forceNew=true` (derived server-side in `page.tsx` from
the `new=1` query param) and skips the sessionStorage restore, additionally clearing the
stored key so a stale id doesn't resurrect on the *next* bare-`/chat` nav-menu visit before
a new channel exists. Sending the first message in this blank chat still creates a real
channel exactly as before (`send()`'s `isNewChat` branch, unchanged).

EXPECTED DENIALS: n/a.

EXPECTED DATABASE STATE: no channel created by the click itself — only once a message is
actually sent.

EXPECTED AUDIT EVENTS: n/a.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — same caveat as SC-134, needs a real browser
pass next session.

LAST VERIFIED DATE: not yet run live — implemented and build-verified 2026-08-28.
