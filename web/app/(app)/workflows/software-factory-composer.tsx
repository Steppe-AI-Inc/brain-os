"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { consumeChatStream, toChatResult, type ChatResult } from "@/lib/chat-stream";

type Result = ChatResult | { error: string };

export function SoftwareFactoryComposer() {
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function plan() {
    const trimmed = task.trim();
    if (!trimmed) return;
    setRunning(true);
    setResult(null);
    const command = `Build this as a software factory task: ${trimmed}. Create a short PRD, break it into atomic tickets (tasks), and add a release approval gate before anything ships.`;
    await consumeChatStream(command, (evt) => {
      if (evt.type === "done") {
        setResult(toChatResult(evt));
      } else if (evt.type === "error") {
        setResult({ error: evt.error || "Unknown error" });
      }
    });
    setRunning(false);
  }

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Software Factory — give it a task
        </CardTitle>
        <CardDescription>
          Describe a feature or fix in plain language. Brain OS plans it as a PRD, breaks it into
          tickets, and puts a release approval gate in front of it — the same real pipeline as
          every other command here, not a simulation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Add a low-battery alert for parking sensors that notifies the ops team and creates a maintenance ticket."
          rows={3}
          disabled={running}
        />
        <Button size="sm" onClick={plan} disabled={running || !task.trim()} className="self-start">
          {running ? "Planning…" : "Plan it"}
        </Button>
        {result && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            {"error" in result ? (
              <span className="font-medium text-destructive">{result.error}</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p>{result.summary}</p>
                <div className="flex flex-wrap gap-1.5">
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
}
