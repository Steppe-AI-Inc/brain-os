// WHERE A RELEASE'S SIGNED MANIFEST IS SERVED (CR-004 Option A; scripts/factory-runner/enrolled/setup.mjs locateManifest): the Factory
// project's public release storage, <bucket>/production/<version>/BrainFactorySetup.manifest.json - beside the installer the
// founder's staging step placed there. The installer fetches it from that address and verifies it against the trust set fixed into
// itself; where the manifest came from adds no trust, and the manifest is public data.
//
// The Admin API writes exactly this ONE object, and only after factory.admin_authorize_update published the release whose manifest
// it is. It writes with the address and the storage key the platform gives every function of the project (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY): read from the environment in the entry point, never a literal, and sent nowhere but that address.
export const RELEASE_BUCKET = 'factory-releases';
export const MANIFEST_FILE = 'BrainFactorySetup.manifest.json';
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$/;

/** the manifest as served: the JSON the release tool writes (two-space indent, one trailing LF) */
export const manifestText = (manifest: Record<string, unknown>): string => JSON.stringify(manifest, null, 2) + '\n';

/** createAdminApi's storeManifest. True when storage took the object; false when it cannot be asked (no address or key, a version
 *  that is not a version) or when storage refused it. The release is published either way, and authorizing the same release again
 *  places the manifest. Storage not answering at all is an error like any other: it reaches the handler's request boundary. */
export function manifestStore(cfg: { url: string; key: string; fetch: typeof fetch }): (version: string, manifest: Record<string, unknown>) => Promise<boolean> {
  return async (version, manifest) => {
    if (!cfg.url || !cfg.key || !VERSION.test(version)) return false;
    const r = await cfg.fetch(cfg.url.replace(/\/+$/, '') + '/storage/v1/object/' + RELEASE_BUCKET + '/production/' + encodeURIComponent(version) + '/' + MANIFEST_FILE, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + cfg.key, apikey: cfg.key, 'content-type': 'application/json', 'x-upsert': 'true' },
      body: manifestText(manifest),
    });
    return r.ok;
  };
}
