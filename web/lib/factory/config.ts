// Factory endpoints for Brain OS -> Factory -> Computers (WO-8). Non-secret: the Factory project's public function URL and the
// public release storage (CR-004 Option A). Both can be overridden per environment (a preview pointed at a disposable plane), but
// only to an address that is allowed to receive the signed-in user's own Brain OS token: a Supabase project over HTTPS, or a
// loopback harness. Anything else is refused - the page never forwards a session to an arbitrary host.

const DEFAULT_ADMIN_API = "https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-admin-api";
const DEFAULT_RELEASES = "https://npvhuoozkbexddnvkqsj.supabase.co/storage/v1/object/public/factory-releases";

function allowed(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const loopback = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  const supabase = u.protocol === "https:" && /^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname);
  if (!loopback && !supabase) return null;
  if (u.search || u.hash || u.username || u.password) return null;
  return u.toString().replace(/\/+$/, "");
}

/** where admin actions go, or null when the configured value is not an allowed Factory endpoint */
export function factoryAdminApiUrl(): string | null {
  return allowed(process.env.FACTORY_ADMIN_API_URL || DEFAULT_ADMIN_API);
}

/** the public release storage: <base>/<channel>/<version>/BrainFactorySetup.exe and BrainFactorySetup.manifest.json */
export function factoryReleasesUrl(): string | null {
  return allowed(process.env.FACTORY_RELEASES_URL || DEFAULT_RELEASES);
}

export const INSTALLER_FILE = "BrainFactorySetup.exe";
export const MANIFEST_FILE = "BrainFactorySetup.manifest.json";
