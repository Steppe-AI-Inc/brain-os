"use client";

import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runChatCommand, type ChatResult } from "@/app/(app)/chat/actions";

export function WorkflowGrid({
  workflows,
}: {
  workflows: Array<{ title: string; command: string }>;
}) {
  const [results, setResults] = useState<Record<string, ChatResult>>({});
  const [runningTitle, setRunningTitle] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(workflow: { title: string; command: string }) {
    setRunningTitle(workflow.title);
    startTransition(async () => {
      const result = await runChatCommand(workflow.command);
      setResults((prev) => ({ ...prev, [workflow.title]: result }));
      setRunningTitle(null);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((w) => {
        const result = results[w.title];
        const isRunning = runningTitle === w.title;
        return (
          <Card key={w.title} className="bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base">{w.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{w.command}</p>
              <Button size="sm" onClick={() => run(w)} disabled={isRunning} className="gap-1.5 self-start">
                <PlayCircle className="h-4 w-4" />
                {isRunning ? "Running…" : "Run"}
              </Button>
              {result && (
                <div className="rounded-lg bg-muted/50 p-2 text-xs">
                  {result.error ? (
                    <span className="font-medium text-destructive">{result.error}</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <p>{result.summary}</p>
                      <div className="flex gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{result.taskCount} task(s)</Badge>
                        <Badge variant="outline" className="text-[10px]">{result.approvalCount} approval(s)</Badge>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
