import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// This is the literal fix for the old app's missing auth gate: the vanilla-JS prototype
// showed the full app to anyone with the URL, with zero session check (SEM.Store just
// hardcoded a local currentUserId). Every request now refreshes the session and, unless
// signed in or already headed to /login, is redirected there before any page renders.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isPublicRoute =
    isLoginRoute ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/auth/callback");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const isSignupRoute = request.nextUrl.pathname.startsWith("/signup");

  if (user && (isLoginRoute || isSignupRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
