import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  Gavel,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCompanies } from "@/lib/data/companies";
import { getPeople } from "@/lib/data/people";
import {
  addPerformanceCaseNote,
  createPerformanceCase,
  finalizePerformanceCaseAction,
  getPerformanceCaseDetail,
  getPerformanceCases,
  queueArtifactDriveBackup,
  transitionPerformanceCase,
} from "@/lib/data/performance-cases";
import { PerformanceArtifactUpload } from "./performance-artifact-upload";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function PerformanceCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const query = await searchParams;
  const [cases, companies, people] = await Promise.all([
    getPerformanceCases(),
    getCompanies(),
    getPeople(),
  ]);
  const selectedId = query.case && cases.some((item) => item.id === query.case)
    ? query.case
    : cases[0]?.id ?? null;
  const detail = await getPerformanceCaseDetail(selectedId);

  const openCount = cases.filter((item) => !["closed"].includes(item.status)).length;
  const criticalCount = cases.filter((item) => item.rating === "critical").length;
  const decisionCount = cases.filter((item) => item.status === "decision_pending").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BriefcaseBusiness}
        title="Country Leadership"
        description="Evidence-based management of country CEOs: reports, expectations, improvement plans, approvals, replacement and audit history."
      />

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Open cases", value: openCount, icon: BriefcaseBusiness },
          { label: "Critical", value: criticalCount, icon: AlertTriangle },
          { label: "Awaiting decision", value: decisionCount, icon: ShieldCheck },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/85">
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
              </div>
              <stat.icon className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/85">
        <CardHeader>
          <CardTitle className="text-base">Open a country leadership case</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPerformanceCase} className="grid gap-3 lg:grid-cols-6">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <Label htmlFor="case-title">Case title</Label>
              <Input id="case-title" name="title" placeholder="Uzbekistan Country CEO performance" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-company">Company</Label>
              <select id="case-company" name="company_id" className={fieldClass} required defaultValue="">
                <option value="" disabled>Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-person">Country leader</Label>
              <select id="case-person" name="person_id" className={fieldClass} required defaultValue="">
                <option value="" disabled>Select person</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-country">Country</Label>
              <Input id="case-country" name="country" placeholder="Uzbekistan" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-review-date">Review date</Label>
              <Input id="case-review-date" name="review_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <Label htmlFor="case-role">Role</Label>
              <Input id="case-role" name="role_title" placeholder="Country CEO" />
            </div>
            <div className="flex flex-col gap-1.5 lg:col-span-4">
              <Label htmlFor="case-summary">Reason and current facts</Label>
              <Textarea
                id="case-summary"
                name="summary"
                placeholder="Record objective facts: targets, orders, reporting gaps, support provided and current risks."
              />
            </div>
            <Button type="submit" className="self-end lg:col-span-6 lg:justify-self-start">
              Open case
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden bg-card/85">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Leadership cases</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[720px] space-y-2 overflow-auto p-3">
            {cases.map((item) => (
              <Link
                key={item.id}
                href={`/people/cases?case=${item.id}`}
                className={`block rounded-xl border p-3 transition-colors ${
                  item.id === selectedId
                    ? "border-primary/50 bg-primary/8"
                    : "border-border/70 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <Badge variant={item.rating === "critical" ? "destructive" : "outline"}>
                    {statusLabel(item.rating)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.people?.full_name ?? "Unknown"} · {item.country || item.companies?.name || "Unassigned"}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{statusLabel(item.status)}</span>
                  <span>{formatDate(item.review_date)}</span>
                </div>
              </Link>
            ))}
            {cases.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No leadership cases yet. Open the first case above.
              </p>
            )}
          </CardContent>
        </Card>

        {detail ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="bg-card/90">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{detail.case.title}</h2>
                      <Badge>{statusLabel(detail.case.status)}</Badge>
                      <Badge variant={detail.case.rating === "critical" ? "destructive" : "outline"}>
                        {statusLabel(detail.case.rating)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail.case.people?.full_name} · {detail.case.role_title || detail.case.people?.role_title || "Country leader"} · {detail.case.country || detail.case.companies?.name}
                    </p>
                    {detail.case.summary && <p className="mt-3 max-w-4xl text-sm">{detail.case.summary}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Review: {formatDate(detail.case.review_date)}</p>
                    <p>Updated: {formatDate(detail.case.updated_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 2xl:grid-cols-2">
              <Card className="bg-card/85">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Archive className="h-4 w-4" /> Evidence vault
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PerformanceArtifactUpload
                    caseId={detail.case.id}
                    companyId={detail.case.company_id}
                  />

                  <div className="space-y-2 border-t pt-3">
                    {detail.documents.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{document.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {document.category?.replaceAll("_", " ")} · {document.mime_type || "file"} · {formatDate(document.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {document.storage_path && (
                            <a
                              href={`/documents/${document.id}/download`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" /> Download
                            </a>
                          )}
                          {document.storage_path && (
                            <form action={queueArtifactDriveBackup}>
                              <input type="hidden" name="case_id" value={detail.case.id} />
                              <input type="hidden" name="document_id" value={document.id} />
                              <Button size="sm" variant="ghost" type="submit">Queue Drive</Button>
                            </form>
                          )}
                        </div>
                      </div>
                    ))}
                    {detail.documents.length === 0 && (
                      <p className="text-sm text-muted-foreground">No evidence stored yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/85">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Management record
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form action={addPerformanceCaseNote} className="grid gap-3">
                    <input type="hidden" name="case_id" value={detail.case.id} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input name="title" placeholder="Meeting, feedback or observation" required />
                      <select name="event_type" className={fieldClass} defaultValue="note">
                        <option value="note">Management note</option>
                        <option value="review">Performance review</option>
                        <option value="communication">Communication</option>
                        <option value="candidate">Candidate note</option>
                      </select>
                    </div>
                    <Textarea name="details" placeholder="Record objective facts, evidence, commitments and next steps." />
                    <Button type="submit" variant="outline" className="justify-self-start">Add record</Button>
                  </form>

                  <div className="max-h-80 space-y-3 overflow-auto border-t pt-3">
                    {detail.events.map((event) => (
                      <div key={event.id} className="border-l-2 border-primary/30 pl-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{event.title}</p>
                          <span className="text-[10px] text-muted-foreground">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{event.event_type}</p>
                        {event.details && <p className="mt-1 text-xs text-muted-foreground">{event.details}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-amber-500/25 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gavel className="h-4 w-4" /> Founder-controlled employment workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Brain OS organizes evidence and workflow. It cannot terminate or appoint a person without an approved HR decision and confirmed local employment-law review.
                </p>

                <div className="grid gap-4 xl:grid-cols-3">
                  <form action={transitionPerformanceCase} className="space-y-3 rounded-xl border bg-background/60 p-4">
                    <input type="hidden" name="case_id" value={detail.case.id} />
                    <input type="hidden" name="action" value="start_improvement_plan" />
                    <h3 className="text-sm font-semibold">1. Improvement plan</h3>
                    <Textarea name="notes" placeholder="Measurable targets, expected orders, reporting cadence and acceptance evidence." required />
                    <Input name="deadline" type="date" required />
                    <Button type="submit" variant="outline" className="w-full">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Start improvement plan
                    </Button>
                  </form>

                  <form action={transitionPerformanceCase} className="space-y-3 rounded-xl border bg-background/60 p-4">
                    <input type="hidden" name="case_id" value={detail.case.id} />
                    <input type="hidden" name="action" value="request_termination" />
                    <h3 className="text-sm font-semibold">2. Termination review</h3>
                    <Textarea name="notes" placeholder="Objective basis, missed expectations, evidence and alternatives considered." required />
                    <Button type="submit" variant="destructive" className="w-full">
                      <ShieldCheck className="mr-2 h-4 w-4" /> Request approval
                    </Button>
                  </form>

                  <form action={transitionPerformanceCase} className="space-y-3 rounded-xl border bg-background/60 p-4">
                    <input type="hidden" name="case_id" value={detail.case.id} />
                    <input type="hidden" name="action" value="start_replacement_search" />
                    <h3 className="text-sm font-semibold">3. Replacement search</h3>
                    <Textarea name="notes" placeholder="Candidate profile, market, compensation range and 90-day outcomes." required />
                    <Input name="deadline" type="date" />
                    <Button type="submit" variant="outline" className="w-full">
                      <Search className="mr-2 h-4 w-4" /> Open search task
                    </Button>
                  </form>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <form action={transitionPerformanceCase} className="space-y-3 rounded-xl border bg-background/60 p-4">
                    <input type="hidden" name="case_id" value={detail.case.id} />
                    <input type="hidden" name="action" value="nominate_replacement" />
                    <h3 className="text-sm font-semibold">Nominate replacement candidate</h3>
                    <select name="candidate_person_id" className={`${fieldClass} w-full`} required defaultValue="">
                      <option value="" disabled>Select a person already entered in People</option>
                      {people.filter((person) => person.id !== detail.case.person_id).map((person) => (
                        <option key={person.id} value={person.id}>{person.full_name} · {person.role_title || "candidate"}</option>
                      ))}
                    </select>
                    <Textarea name="notes" placeholder="Assessment, references, proposed compensation and 90-day plan." required />
                    <Button type="submit" variant="outline">
                      <UserRoundCheck className="mr-2 h-4 w-4" /> Request hiring approval
                    </Button>
                  </form>

                  <div className="space-y-3 rounded-xl border bg-background/60 p-4">
                    <h3 className="text-sm font-semibold">Final recorded actions</h3>
                    <form action={finalizePerformanceCaseAction} className="grid gap-2">
                      <input type="hidden" name="case_id" value={detail.case.id} />
                      <input type="hidden" name="action" value="finalize_termination" />
                      <Input name="effective_date" type="date" required />
                      <Textarea name="notes" placeholder="Counsel reference, notice, handover and final employment record." required />
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" name="legal_review_confirmed" value="yes" required className="mt-0.5" />
                        Local employment-law review and the approved HR decision are confirmed.
                      </label>
                      <Button type="submit" variant="destructive">Record approved termination</Button>
                    </form>

                    <form action={finalizePerformanceCaseAction} className="grid gap-2 border-t pt-3">
                      <input type="hidden" name="case_id" value={detail.case.id} />
                      <input type="hidden" name="action" value="finalize_hire" />
                      <select name="candidate_person_id" className={fieldClass} required defaultValue={detail.case.replacement_person_id || ""}>
                        <option value="" disabled>Select approved candidate</option>
                        {people.filter((person) => person.id !== detail.case.person_id).map((person) => (
                          <option key={person.id} value={person.id}>{person.full_name}</option>
                        ))}
                      </select>
                      <Input name="effective_date" type="date" required />
                      <Textarea name="notes" placeholder="Appointment terms, legal review and onboarding plan." required />
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" name="legal_review_confirmed" value="yes" required className="mt-0.5" />
                        Local hiring review and the approved candidate decision are confirmed.
                      </label>
                      <Button type="submit">Record approved appointment</Button>
                    </form>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="bg-card/85">
                <CardHeader><CardTitle className="text-base">Case tasks</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {detail.tasks.map((task) => (
                    <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                      </div>
                      <Badge variant="outline">{statusLabel(task.status || "queued")}</Badge>
                    </div>
                  ))}
                  {detail.tasks.length === 0 && <p className="text-sm text-muted-foreground">No case tasks yet.</p>}
                </CardContent>
              </Card>

              <Card className="bg-card/85">
                <CardHeader><CardTitle className="text-base">Required approvals</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {detail.approvals.map((approval) => (
                    <div key={approval.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{approval.title}</p>
                        <p className="text-xs text-muted-foreground">{approval.reason}</p>
                      </div>
                      <Badge variant={approval.status === "approved" ? "default" : approval.status === "rejected" ? "destructive" : "outline"}>
                        {statusLabel(approval.status || "pending")}
                      </Badge>
                    </div>
                  ))}
                  {detail.approvals.length === 0 && <p className="text-sm text-muted-foreground">No approvals requested yet.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="flex items-center justify-center bg-card/80">
            <CardContent className="py-20 text-center text-sm text-muted-foreground">
              Open a leadership case to begin collecting evidence and managing outcomes.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
