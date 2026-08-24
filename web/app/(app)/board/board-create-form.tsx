"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createBoard } from "@/lib/data/boards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BoardCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBoard(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) router.push(`/board/${result.id}`);
    });
  }

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New board
        </Button>
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4">
        <form action={submit} className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(260px,1.4fr)_auto] md:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-company">Company</Label>
              <Select name="company_id" required>
                <SelectTrigger id="board-company" className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-name">Board name</Label>
              <Input id="board-name" name="name" maxLength={120} required placeholder="OpenSpot Uzbekistan launch" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-description">Purpose</Label>
              <Input
                id="board-description"
                name="description"
                maxLength={500}
                placeholder="Sales, proposal, deployment, and follow-up"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || companies.length === 0}>
                {pending ? "Creating…" : "Create"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
          {companies.length === 0 && (
            <p className="text-sm text-muted-foreground">Create a company before adding a board.</p>
          )}
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
