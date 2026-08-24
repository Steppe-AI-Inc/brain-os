import { HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Faq = { q: string; a: string };
type Section = { title: string; items: Faq[] };

const SECTIONS: Section[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is Brain OS?",
        a: "Brain OS is the shared operating brain for Steppe AI and every company under it (CLIX GPS, Fuelmetrix, Trade-book.ai, and the rest). It holds real company data — companies, people, projects, goals, tasks — and an AI chat that can read and act on that data instead of you clicking through forms for everything.",
      },
      {
        q: "How do I add a company, person, department, product, or lead?",
        a: "Open the relevant page from the sidebar (Companies, People, Departments, Product Factory, Sales OS...) — every one of them has an inline form at the top of the page. Fill it in and submit; the new row shows up in the table immediately below.",
      },
      {
        q: "How do I edit or delete something I already added?",
        a: "Hover any row in a table — a ⋯ menu appears on the right (it's always visible on touch devices, and shows on hover with a mouse). Click it for Edit and Delete. Edit opens a side panel pre-filled with the current values.",
      },
      {
        q: "Why can't I edit some things, like salary or KPI data?",
        a: "Row-level security limits sensitive data (salary, confidential memories, restricted documents) to the founder, admins, or a company's own manager. If a page looks read-only, it's most likely because your account's role doesn't have write access to that data — that's enforced by the database, not just hidden in the UI.",
      },
    ],
  },
  {
    title: "AI chat & memory",
    items: [
      {
        q: "What are the channels in the chat sidebar?",
        a: "Each chat is its own channel, like a ChatGPT conversation thread. Start a new chat with the pinned \"New chat\" button; once you send a first message, Brain OS reads the reply and gives the channel a real name automatically — you never have to name it yourself. Older channels stay listed, newest first.",
      },
      {
        q: "What does Brain OS actually remember between chats?",
        a: "When something worth keeping comes up in a conversation (a fact, a decision, a number), Brain OS can save it as a memory tied to a company or channel. Later chats — even ones that never use the same words — can retrieve it, because memories are matched by meaning (semantic search over embeddings), not by keyword. You can see everything it has stored on the Memory page.",
      },
      {
        q: "Which AI model answers my chat messages?",
        a: "Whichever provider is marked Active on Settings → Providers. If no API key is configured for that provider, chat falls back to a deterministic planner rather than failing outright — you'll still get a response, just not a model-generated one.",
      },
      {
        q: "Can I attach files, images, or use voice input in chat?",
        a: "Not yet — today chat is text-only. File-based knowledge goes through the Documents & Knowledge page or the Finance upload instead. This is on the list to add.",
      },
    ],
  },
  {
    title: "Approvals & risk",
    items: [
      {
        q: "Why do some AI actions need my approval first?",
        a: "Anything with real business consequence — registering a company, a proposal discount above 5%, deleting data — is flagged and held for a human decision rather than executed silently. The risk thresholds are computed server-side, not just displayed, so they can't be bypassed from the UI.",
      },
      {
        q: "What actually happens when I click Approve?",
        a: "For most approvals, the underlying action already happened at the moment it was proposed (for example, a batch delete is recorded as an approval for your audit trail, not held pending it) — approving marks it reviewed. For proposals where nothing has executed yet, Approve is what triggers it. If a specific approval's behavior looks wrong, flag it — not every action type has real execution wired up yet.",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        q: "What happens when I upload a financial document?",
        a: "Go to Finance, choose the company and period, and upload a PDF or text file. In one pass, Brain OS stores the file, reads it with AI (real document understanding, not just text scraping), extracts revenue/expenses/net income/cash position, writes a financial_reports row, and saves a health-summary memory so you can later ask chat how that company is doing and get the real numbers back.",
      },
      {
        q: "Does Brain OS do real bookkeeping?",
        a: "No — it's AI-assisted analysis and reporting from whatever document you upload, not a system of record. There's no double-entry ledger or bank-feed reconciliation. Treat the health dashboard as a fast read, not an audited statement.",
      },
    ],
  },
  {
    title: "Software & engineering factories",
    items: [
      {
        q: "What does the Software Factory do today?",
        a: "Give it a feature title and a problem statement and it plans the work — a full PRD plus six atomic engineering tickets, generated by AI. It does not yet write and ship the code itself; that's a bigger autonomous-execution capability that's still being built.",
      },
      {
        q: "Can it generate parking spot or EV charging station drawings?",
        a: "Yes, on the Engineering Factory page — describe a layout in plain language and it drafts a labeled, scaled, top-down diagram (stall counts, EV stalls, aisles, dimensions). This is a real technical drawing, not construction-grade CAD — there's no DXF/DWG export, so treat it as a fast design sketch to communicate a layout, not a build-ready plan.",
      },
    ],
  },
  {
    title: "Settings & Model Intelligence",
    items: [
      {
        q: "How do I add or switch AI providers?",
        a: "Settings → Providers. Add a provider/model pair and mark one Active — that's what chat and every AI action use. The real API key never lives in this app; it's a Supabase Edge Function secret set outside the UI, so switching Active providers only works once that provider's key is actually configured.",
      },
      {
        q: "What is the Model Intelligence page for?",
        a: "It's a budget simulator — plug in your expected tokens per run and runs per month, and it shows real, current pricing per model side by side with a capability/speed comparison, so you can pick a model on cost and quality together instead of guessing.",
      },
      {
        q: "Where do I see how much AI usage has actually cost?",
        a: "Settings → Usage — real token counts and dollar cost per call, not an estimate, going back over the recent history of Brain OS activity.",
      },
    ],
  },
  {
    title: "Access, sign-in & languages",
    items: [
      {
        q: "How do I sign in?",
        a: "With your email and password today. Google sign-in and an email verification-code flow are on the roadmap but not live yet — don't rely on either until they show up on the sign-in screen.",
      },
      {
        q: "Who can see what?",
        a: "User Access shows every real account and which companies they belong to — there's no \"switch user\" simulator like some tools have. What you can see and edit is enforced by the database itself (row-level security), matched to your actual role, not just hidden by the interface.",
      },
      {
        q: "Is there a Mongolian interface?",
        a: "Yes — the EN / MN toggle at the bottom of the sidebar switches the interface language immediately, no reload needed.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HelpCircle}
        title="Help & FAQ"
        description="How Brain OS actually works today — what's live, what's coming, and how to do the everyday things."
      />

      <Card className="bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
              <span>
                <span className="font-medium">Connect an AI provider.</span> Settings → Providers — add a
                provider and mark one Active so chat has a real model to call.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
              <span>
                <span className="font-medium">Add your first company.</span> Companies → fill in the form at the
                top. People, Departments, Projects, and Goals can all be scoped to it afterward.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
              <span>
                <span className="font-medium">Talk to Brain OS.</span> Speak with Brain OS — ask it to do things
                in plain language. It reads real company data and proposes real actions.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">4</span>
              <span>
                <span className="font-medium">Check Approvals regularly.</span> Anything with real business risk
                waits there for a human decision — it won&apos;t happen on its own.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.title} className="bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {section.items.map((item) => (
              <details key={item.q} className="group border-b border-border/60 py-2.5 last:border-0">
                <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
