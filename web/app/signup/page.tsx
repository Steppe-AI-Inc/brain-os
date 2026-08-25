"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signUp } from "./actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, null);

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="border-border/60 bg-card/90 backdrop-blur">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
              Σ
            </div>
            <CardTitle className="text-xl">Create your Brain OS account</CardTitle>
            <p className="text-sm text-muted-foreground">
              This creates a platform account and a private personal workspace. It does not make you an employee or give access to any existing company.
            </p>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" autoComplete="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
              {state?.message && <p className="text-sm font-medium text-emerald-600">{state.message}</p>}
              <Button type="submit" disabled={pending}>
                <UserPlus className="mr-2 h-4 w-4" />
                {pending ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account? <Link className="font-medium text-foreground underline" href="/login">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Platform user ≠ employee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">Platform account</div>
              <p>Your identity for signing into Brain OS.</p>
            </div>
            <div>
              <div className="font-medium text-foreground">Workspace / organization</div>
              <p>A company or personal workspace that owns its own data, billing, agents and policies.</p>
            </div>
            <div>
              <div className="font-medium text-foreground">Organization membership</div>
              <p>Owner, admin, manager, member or guest — scoped to one workspace.</p>
            </div>
            <div>
              <div className="font-medium text-foreground">Employee profile</div>
              <p>Separate employment record for role, manager, KPI, salary and certification. It can exist without a login.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
