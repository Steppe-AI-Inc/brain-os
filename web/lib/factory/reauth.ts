// THE PASSWORD RE-ENTRY BEHIND FACTORY -> UPDATE (founder decision 2026-10-03). The account that is signed in enters its password
// again, and Brain OS's own password sign-in checks it: the same Supabase Auth call the login page makes
// (POST /auth/v1/token?grant_type=password), for the email of the session that is signed in - never an email the page supplies.
// A correct password opens a NEW session; its token states when the password was entered (`amr`), and that token is what the
// Factory Admin API is called with. The page's own session and cookie are left alone: nothing here is stored.
//
// THE PASSWORD GOES TO BRAIN OS AND NOWHERE ELSE. It is not sent to the Factory, not logged, not returned, not put in an error.
// The new session is ended (scope=local: this session only, never the account's other sessions) as soon as the Factory answered.
//
// No dependency on the request, cookies or next/*: the caller hands in the account, and the suite runs this file as it is.

export type Reauth =
  | { ok: true; token: string; signOut: () => Promise<boolean> }
  | { ok: false; refused: "wrong_password" | "reauth_unavailable" | "not_this_account"; message: string };

type Cfg = { url: string; anonKey: string; fetch?: typeof fetch };
const TIMEOUT_MS = 15000;

export async function passwordReauth(cfg: Cfg, account: { id: string; email: string }, password: string): Promise<Reauth> {
  const call = cfg.fetch ?? fetch;
  const base = cfg.url.replace(/\/+$/, "");
  const headers = { apikey: cfg.anonKey, "content-type": "application/json" };
  let res: Response;
  try {
    res = await call(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: account.email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, refused: "reauth_unavailable", message: "Brain OS did not answer the password check. Nothing was authorized." };
  }
  if (res.status !== 200) {
    // Supabase Auth names a wrong password invalid_credentials (older versions: invalid_grant). Only that is "wrong password": any
    // other refusal - a CAPTCHA it wants, a rate limit, a disabled sign-in - is the check not having been made. Its text is not passed on.
    let code = "";
    try {
      const body = (await res.json()) as { error_code?: unknown; error?: unknown };
      code = typeof body.error_code === "string" ? body.error_code : typeof body.error === "string" ? body.error : "";
    } catch {
      code = "";
    }
    if (res.status === 400 && (code === "invalid_credentials" || code === "invalid_grant")) {
      return { ok: false, refused: "wrong_password", message: "That is not this account's password. Nothing was authorized." };
    }
    const named = /^[a-z_]{1,40}$/.test(code) ? `, ${code}` : "";
    return { ok: false, refused: "reauth_unavailable", message: `Brain OS did not check the password (HTTP ${res.status}${named}). Nothing was authorized.` };
  }
  let session: { access_token?: unknown; user?: { id?: unknown } } | null = null;
  try {
    session = await res.json();
  } catch {
    session = null;
  }
  const token = session && typeof session.access_token === "string" ? session.access_token : null;
  if (!token) return { ok: false, refused: "reauth_unavailable", message: "Brain OS answered the password check without a session. Nothing was authorized." };
  const signOut = async (): Promise<boolean> => {
    try {
      const out = await call(`${base}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: cfg.anonKey, authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return out.status === 204 || out.status === 200;
    } catch {
      return false;
    }
  };
  // the session must be the SAME account that is signed in on the page
  if (!session || !session.user || session.user.id !== account.id) {
    await signOut();
    return { ok: false, refused: "not_this_account", message: "The password check answered for another account. Nothing was authorized." };
  }
  return { ok: true, token, signOut };
}
