"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error?: string; message?: string } | null;

export async function signUp(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (fullName.length < 2) return { error: "Enter your full name." };
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };

  // If email confirmation is disabled, the v1 auth trigger has already created the
  // platform profile + personal workspace and the user can enter immediately.
  if (data.session) redirect("/workspaces");

  return {
    message:
      "Account created. Check your email to confirm the address, then sign in. Your personal workspace will be created automatically.",
  };
}
