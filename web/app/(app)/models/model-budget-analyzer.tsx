"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, DollarSign, Gauge, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODEL_CATALOG, PRICING_SNAPSHOT_DATE, estimateMonthlyCost, type ModelProfile } from "@/lib/usage/pricing";

function money(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 10) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(0)}`;
}

function context(value: number): string {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1000)}K`;
}

function CapabilityCostGraphic({ rows }: { rows: Array<{ model: ModelProfile; monthlyCost: number }> }) {
  const maxCost = Math.max(1, ...rows.map((row) => row.monthlyCost));

  return (
    <Card className="border-border/80 bg-card/80 shadow-none">
      <CardContent className="pt-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Capability versus monthly cost</h2>
            <p className="text-xs text-muted-foreground">Two normalized bars per model make the trade-off visible at a glance.</p>
          </div>
          <Badge variant="outline">Planning snapshot {PRICING_SNAPSHOT_DATE}</Badge>
        </div>
        <div className="space-y-4">
          {rows.map(({ model, monthlyCost }) => (
            <div key={model.model} className="grid gap-2 md:grid-cols-[11rem_1fr_1fr_5rem] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{model.label}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {model.provider} · {model.tier}
                </p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Capability</span>
                  <span>{model.capabilityScore}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${model.capabilityScore}%`, backgroundColor: model.color }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Relative spend</span>
                  <span>{money(monthlyCost)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-foreground/55"
                    style={{ width: `${Math.max(1.5, (monthlyCost / maxCost) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-sm font-semibold tabular-nums">{money(monthlyCost)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ModelBudgetAnalyzer({ activeModel }: { activeModel: string | null }) {
  const [provider, setProvider] = useState<"all" | "openai" | "anthropic">("all");
  const [inputTokens, setInputTokens] = useState(8_000);
  const [outputTokens, setOutputTokens] = useState(2_000);
  const [monthlyRuns, setMonthlyRuns] = useState(1_000);

  const rows = useMemo(
    () =>
      MODEL_CATALOG.filter((model) => provider === "all" || model.provider === provider)
        .map((model) => ({ model, monthlyCost: estimateMonthlyCost(model, inputTokens, outputTokens, monthlyRuns) }))
        .sort((a, b) => b.model.capabilityScore - a.model.capabilityScore),
    [provider, inputTokens, outputTokens, monthlyRuns]
  );

  const bestValue = useMemo(
    () => [...rows].filter((row) => row.model.capabilityScore >= 88).sort((a, b) => a.monthlyCost - b.monthlyCost)[0],
    [rows]
  );

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-border/80 bg-gradient-to-br from-card via-card to-primary/5 shadow-none">
        <CardContent className="grid gap-5 pt-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Model budget simulator</h2>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Compare current Brain OS text/agent models using one standard workload. Prices are deterministic; the
              provisional capability score becomes authoritative only after Brain OS runs its own task-quality
              evaluations.
            </p>
          </div>
          <div className="flex gap-2">
            {(["all", "openai", "anthropic"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={provider === value ? "default" : "outline"}
                onClick={() => setProvider(value)}
                className="capitalize"
              >
                {value}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/80 shadow-none">
          <CardContent className="pt-5">
            <Label htmlFor="model-input-tokens">Average input tokens / run</Label>
            <Input
              id="model-input-tokens"
              type="number"
              min={0}
              value={inputTokens}
              onChange={(event) => setInputTokens(Math.max(0, Number(event.target.value) || 0))}
              className="mt-2"
            />
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-none">
          <CardContent className="pt-5">
            <Label htmlFor="model-output-tokens">Average output tokens / run</Label>
            <Input
              id="model-output-tokens"
              type="number"
              min={0}
              value={outputTokens}
              onChange={(event) => setOutputTokens(Math.max(0, Number(event.target.value) || 0))}
              className="mt-2"
            />
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-none">
          <CardContent className="pt-5">
            <Label htmlFor="model-monthly-runs">Runs / month</Label>
            <Input
              id="model-monthly-runs"
              type="number"
              min={0}
              value={monthlyRuns}
              onChange={(event) => setMonthlyRuns(Math.max(0, Number(event.target.value) || 0))}
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {bestValue && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-semibold">Best value above capability 88: {bestValue.model.label}</p>
                <p className="text-sm text-muted-foreground">{bestValue.model.bestFor}</p>
              </div>
            </div>
            <Badge className="text-sm">{money(bestValue.monthlyCost)} / month</Badge>
          </CardContent>
        </Card>
      )}

      <CapabilityCostGraphic rows={rows} />

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map(({ model, monthlyCost }) => (
          <Card key={model.model} className={`border-border/80 shadow-none ${activeModel === model.model ? "ring-1 ring-primary" : ""}`}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{model.label}</h3>
                    {activeModel === model.model && <Badge>Active</Badge>}
                    <Badge variant="outline" className="capitalize">
                      {model.tier}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{model.model}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">{money(monthlyCost)}</p>
                  <p className="text-[11px] text-muted-foreground">estimated / month</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">{model.bestFor}</p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-secondary/55 p-2">
                  <BrainCircuit className="mb-1 h-3.5 w-3.5" />
                  <p className="text-[10px] text-muted-foreground">Capability</p>
                  <p className="text-sm font-semibold">{model.capabilityScore}/100</p>
                </div>
                <div className="rounded-lg bg-secondary/55 p-2">
                  <Zap className="mb-1 h-3.5 w-3.5" />
                  <p className="text-[10px] text-muted-foreground">Speed</p>
                  <p className="text-sm font-semibold">{model.speedScore}/5</p>
                </div>
                <div className="rounded-lg bg-secondary/55 p-2">
                  <Gauge className="mb-1 h-3.5 w-3.5" />
                  <p className="text-[10px] text-muted-foreground">Context</p>
                  <p className="text-sm font-semibold">{context(model.contextTokens)}</p>
                </div>
                <div className="rounded-lg bg-secondary/55 p-2">
                  <DollarSign className="mb-1 h-3.5 w-3.5" />
                  <p className="text-[10px] text-muted-foreground">In / Out MTok</p>
                  <p className="text-sm font-semibold">
                    ${model.inputPer1M} / ${model.outputPer1M}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{model.pricingNote}</span>
                <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  Official pricing
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This catalog intentionally lists text/agent models compatible with the Brain OS structured command path.
        Image, audio, realtime, embedding, deprecated, and invitation-only models are separate workloads and are not
        selectable as the company-command model.
      </p>
    </div>
  );
}
