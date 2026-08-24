"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { sendSignupCode, verifySignupCode, signInWithGoogle } from "./actions";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"details" | "code">("details");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [verifyError, verifyAction, verifying] = useActionState(verifySignupCode, null);

  function handleSendCode(formData: FormData) {
    const enteredEmail = String(formData.get("email") || "").trim();
    startSending(async () => {
      const result = await sendSignupCode(null, formData);
      if (result) {
        setSendError(result);
        return;
      }
      setSendError(null);
      setEmail(enteredEmail);
      setStep("code");
    });
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <Card className="w-full max-w-sm border-border/60 bg-card/90 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white">
            Σ
          </div>
          <CardTitle className="text-xl">Create your Brain OS account</CardTitle>
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

          {step === "details" ? (
            <form action={handleSendCode} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" required autoComplete="name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              </div>
              {sendError && <p className="text-sm font-medium text-destructive">{sendError}</p>}
              <Button type="submit" disabled={sending}>
                {sending ? "Sending code…" : "Send verification code"}
              </Button>
            </form>
          ) : (
            <form action={verifyAction} className="flex flex-col gap-4">
              <input type="hidden" name="email" value={email} />
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it below.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="token">Verification code</Label>
                <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" />
              </div>
              {verifyError && <p className="text-sm font-medium text-destructive">{verifyError}</p>}
              <Button type="submit" disabled={verifying}>
                {verifying ? "Verifying…" : "Verify & create account"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Use a different email
              </button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
