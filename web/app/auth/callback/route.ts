import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) lands here with a ?code= param to exchange for a real session —
// magic-link/email-OTP verification happens client-side via verifyOtp instead, so this
// route only needs to handle the authorization-code-grant style redirect.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
