import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/locale-toggle";

export default async function Home() {
  // Phase 0 connectivity check: this runs unauthenticated (no session yet — Phase 1
  // adds real login), so RLS should return an empty/blocked result, not an error. That's
  // the expected, correct behavior to see here, not a bug.
  const supabase = await createClient();
  const { data: agents, error } = await supabase.from("agents").select("id").limit(1);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <Card className="w-full max-w-lg border-border/60 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">SEM Brain — Phase 0 Scaffold</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Theme:</span>
            <Badge className="bg-primary text-primary-foreground">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge className="bg-accent text-accent-foreground">Accent</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Supabase:</span>
            {error ? (
              <Badge variant="destructive">connection error: {error.message}</Badge>
            ) : (
              <Badge className="bg-chart-4 text-primary-foreground">
                connected ({agents?.length ?? 0} row visible unauthenticated)
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">i18n:</span>
            <LocaleToggle />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
