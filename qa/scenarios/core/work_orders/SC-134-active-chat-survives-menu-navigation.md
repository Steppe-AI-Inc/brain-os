SCENARIO ID: SC-134-active-chat-survives-menu-navigation

PURPOSE: The founder's active Brain OS conversation must not be discarded just because he
navigated to Tasks/Approvals/etc. and came back through the main nav. Grounded in a real
complaint: "you should also add batches command... [chat] terrible ux" plus the explicit
2026-08-28 spec: "The user should NOT have to open Channels, find conversation, select
latest chat every time." Root cause: the main nav's "Speak with Brain OS" link
(`components/app-sidebar.tsx`) is a plain `href="/chat"`, and `/chat` with no `channel`
query param has always meant "brand-new blank chat" (`app/(app)/chat/page.tsx`) — there was
no mechanism remembering which channel was open.

ACTOR: any logged-in user with an active chat conversation.

ORGANIZATION: n/a (client-side session state, not RLS-scoped data).

ROLE: any.

CAPABILITIES: n/a.

PRECONDITIONS: user has sent at least one message in a real (non-blank) channel — real
channel id present in `sessionStorage['brainos.chat.activeChannelId']`
(`app/(app)/chat/chat-client.tsx`'s persist effect).

ACTION: open Chat A, send a message, navigate Tasks -> Approvals -> Dashboard -> Chat
(via the main nav "Speak with Brain OS" link, plain `/chat`, 5+ times).

EXPECTED RESULT: each return to Chat shows Chat A — same conversation id, same visible
history, no new channel created. Mechanism: `ChatClient`'s restore effect reads
`sessionStorage`, finds Chat A's id, and does a single `router.replace('/chat?channel=<id>')`
before the user perceives a blank state.

EXPECTED DENIALS: n/a.

EXPECTED DATABASE STATE: no new `chat_channels` row created by navigation alone (only an
explicit "New chat" click or an actual first message in a blank chat creates one).

EXPECTED AUDIT EVENTS: n/a — no server-side action occurs, this is client navigation.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a — sessionStorage is per-tab and clears itself when the tab closes.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY (needs a real browser — `tsc`/`eslint`/
`next build` are all clean for the change, but this is client runtime behavior with no
headless browser available in this pass; verify with Playwright/Claude-in-Chrome next
session before calling it closed).

LAST VERIFIED DATE: not yet run live — implemented and build-verified 2026-08-28.
