"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_MODELS, PRICING_PER_1M, CAPABILITY_TIER } from "@/lib/usage/pricing";

const PROVIDER_COLOR: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d97757",
};

const TIER_LABEL: Record<number, string> = {
  1: "Nano/mini",
  2: "Small",
  3: "Flagship",
  4: "Advanced",
  5: "Top-tier",
};

function fmtPrice(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

export function ModelComparisonPanel() {
  const rows = SUPPORTED_MODELS.map((m) => {
    const [inRate, outRate] = PRICING_PER_1M[m.model] ?? [0, 0];
    const blended = (inRate + outRate) / 2;
    const tier = CAPABILITY_TIER[m.model] ?? 1;
    return { ...m, inRate, outRate, blended, tier };
  });

  const maxBlended = Math.max(...rows.map((r) => r.blended), 1);
  // Chart plots blended $/1M tokens (x, log-ish via sqrt to keep cheap models legible
  // next to $180/1M outliers) against capability tier (y, 1-5).
  const W = 640;
  const H = 260;
  const padL = 40;
  const padB = 30;
  const padT = 10;
  const padR = 20;
  const xFor = (blended: number) => padL + (Math.sqrt(blended) / Math.sqrt(maxBlended)) * (W - padL - padR);
  const yFor = (tier: number) => H - padB - ((tier - 1) / 4) * (H - padB - padT);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/80 shadow-none">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Cost vs. relative capability across every model this app knows pricing for.
            Pricing is verified live against each publisher&apos;s current pricing docs (not
            memorized figures). <span className="font-medium text-foreground">Capability tier is not a benchmark</span> —
            there is no live eval running here — it&apos;s each publisher&apos;s own nano/mini/flagship/pro
            positioning, ordinal 1–5, for a rough sense of where a model sits in its own
            family. Treat it as a starting point for picking a model, not a scientific ranking.
          </p>

          <div className="overflow-x-auto">
            <svg width={W} height={H} className="min-w-[640px]" role="img" aria-label="Cost vs capability scatter plot">
              {[1, 2, 3, 4, 5].map((t) => (
                <g key={t}>
                  <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke="currentColor" strokeOpacity={0.08} />
                  <text x={4} y={yFor(t) + 4} fontSize={10} fill="currentColor" opacity={0.6}>
                    {TIER_LABEL[t]}
                  </text>
                </g>
              ))}
              <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="currentColor" strokeOpacity={0.2} />
              <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="currentColor" strokeOpacity={0.2} />
              {rows.map((r) => (
                <g key={r.model} transform={`translate(${xFor(r.blended)}, ${yFor(r.tier)})`}>
                  <circle r={6} fill={PROVIDER_COLOR[r.provider]} fillOpacity={0.85} />
                  <text x={9} y={4} fontSize={10} fill="currentColor">
                    {r.label}
                  </text>
                </g>
              ))}
              <text x={W / 2} y={H - 6} fontSize={10} fill="currentColor" opacity={0.6} textAnchor="middle">
                Blended $ per 1M tokens (cheaper → left, pricier → right)
              </text>
            </svg>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROVIDER_COLOR.openai }} />
              OpenAI
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROVIDER_COLOR.anthropic }} />
              Anthropic
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-none">
        <div className="flex flex-col divide-y divide-border">
          {rows
            .sort((a, b) => a.blended - b.blended)
            .map((r) => (
              <div key={r.model} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.provider} · {r.model}
                  </div>
                </div>
                <Badge variant="outline">{TIER_LABEL[r.tier]}</Badge>
                <Badge variant="secondary" className="tabular-nums">
                  {fmtPrice(r.inRate)} in
                </Badge>
                <Badge variant="secondary" className="tabular-nums">
                  {fmtPrice(r.outRate)} out
                </Badge>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
