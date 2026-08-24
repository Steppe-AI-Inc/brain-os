"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProposal } from "@/lib/data/proposals";

export function ProposalCreateForm({
  companies,
  products,
}: {
  companies: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; company_id: string | null }>;
}) {
  const [error, formAction, pending] = useActionState(createProposal, null);
  const [companyId, setCompanyId] = useState("");
  const [productLineId, setProductLineId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">New proposal</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required className="w-56" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company_id">Company</Label>
              <Select name="company_id" required value={companyId} onValueChange={(v: unknown) => typeof v === "string" && setCompanyId(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select company">{() => companies.find((c) => c.id === companyId)?.name ?? "Select company"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product_line_id">Product</Label>
              <Select name="product_line_id" required value={productLineId} onValueChange={(v: unknown) => typeof v === "string" && setProductLineId(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select product">{() => products.find((p) => p.id === productLineId)?.name ?? "Select product"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" defaultValue={1} className="w-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount_pct">Discount %</Label>
              <Input id="discount_pct" name="discount_pct" type="number" defaultValue={0} className="w-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment_terms">Payment terms</Label>
              <Input
                id="payment_terms"
                name="payment_terms"
                placeholder="50% upfront, 40% on install, 10% after acceptance"
                className="w-80"
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate proposal"}
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Discount &gt;5% needs manager approval, &gt;15% needs founder approval. Negative
          margin, barter/financing terms, or inventory shortage all force approval —
          computed server-side, not just displayed.
        </p>
      </CardContent>
    </Card>
  );
}
