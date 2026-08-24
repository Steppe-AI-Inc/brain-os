"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sendSignupCode(_prevState: string | null, formData: FormData) {
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!fullName) return "Enter your name.";
  if (!email) return "Enter your email.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { full_name: fullName } },
  });
  if (error) return error.message;

  return null;
}

export async function verifySignupCode(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const token = String(formData.get("token") || "").trim();
  if (!email || !token) return "Enter the code from your email.";

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return error.message;

  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://brain.open-spot.ai";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (error || !data.url) {
    redirect("/login?error=google_not_configured");
  }
  redirect(data.url);
}
