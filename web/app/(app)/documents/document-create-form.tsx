"use client";

import { useActionState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDocument } from "@/lib/data/documents";

export function DocumentCreateForm() {
  const [error, formAction, pending] = useActionState(createDocument, null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (textRef.current) textRef.current.value = String(reader.result || "");
    };
    reader.readAsText(file);
  }

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required className="w-64" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">Upload a text file (optional)</Label>
              <Input id="file" type="file" accept=".txt,.md,.csv" onChange={handleFile} className="w-64" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text">Content</Label>
            <Textarea ref={textRef} id="text" name="text" required className="min-h-24" />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Saving…" : "Add document"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
