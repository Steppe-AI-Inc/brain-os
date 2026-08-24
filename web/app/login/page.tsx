"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signIn } from "./actions";
import { signInWithGoogle } from "../signup/actions";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet — use email instead.",
  oauth_failed: "Google sign-in didn't complete — try again or use email.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, formAction, pending] = useActionState(signIn, null);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-sm border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white">
            Σ
          </div>
          <CardTitle className="text-xl">Sign in to Brain OS</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or with email
            <div className="h-px flex-1 bg-border" />
          </div>
          {oauthError && OAUTH_ERROR_MESSAGES[oauthError] && (
            <p className="text-sm font-medium text-destructive">{OAUTH_ERROR_MESSAGES[oauthError]}</p>
          )}
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="founder@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <Button type="submit" className="mt-2" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="text-foreground underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
