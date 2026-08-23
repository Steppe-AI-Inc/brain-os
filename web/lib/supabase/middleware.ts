import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Phase 0 scope: session refresh only, no route protection yet. Phase 1 adds the
// redirect-to-/login-when-unauthenticated behavior on top of this same helper — this is
// the literal fix for the old app's missing auth gate (it currently shows the full app
// to anyone with the URL, with zero session check).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Required by @supabase/ssr: this call refreshes an expiring session and must not be
  // removed even though the return value isn't used directly yet (Phase 1 will branch on
  // `user` here to redirect unauthenticated requests to /login).
  await supabase.auth.getUser();

  return supabaseResponse;
}
