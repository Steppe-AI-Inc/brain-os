// THE FACTORY DATABASE CONNECTION of both Edge Functions (S-10: "TLS is verify-full"; "the production project is refused").
// Portable: the entry points (Deno) and the developer suites (Node and Deno) use the same functions; the two API handlers read a
// server error through serverSqlState (below).
//
// VERIFY-FULL. postgres.js merges an `ssl` object into tls.connect with the URL's host as the servername, so { ca } means: the
// server's certificate must chain to THIS CA and name the host the URL names. ('require' - what a plain URL gives - encrypts and
// verifies nothing: any server that answers TLS would do.) The CA is the Factory project's database server CA, a public certificate
// the founder downloads from the project settings and stores as FACTORY_DB_CA_PEM (not a secret, but never a value this source
// supplies: a wrong or stale one fails closed). An ssl option given here wins over any sslmode in the URL.
export const PRODUCTION_REF = 'pvphxgrtdfrudejjhzjk';

/** why this function must not open a database connection at all, or null */
export function dbRefusal(url: string, caPem: string): string | null {
  if (!url) return 'the database URL is unset';
  if (url.toLowerCase().includes(PRODUCTION_REF)) return 'the database URL names the Brain OS production project';
  if (!/^postgres(ql)?:\/\//i.test(url)) return 'the database URL is not a postgresql:// URL';
  // an IP literal carries no name to check: postgres.js then sends no servername, and the certificate's name goes unchecked
  // (edge_db_tls_acceptance T3a measured a "localhost" certificate accepted at 127.0.0.1). Verify-full needs the host NAME.
  const asHttp = url.replace(/^postgres(ql)?:/i, 'http:');
  if (!URL.canParse(asHttp)) return 'the database URL does not parse';   // asked first: nothing throws, nothing is caught
  const host = new URL(asHttp).hostname;
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const ipv6 = host.startsWith('[') || host.includes(':');
  if (!host || ipv4 || ipv6) return 'the database URL names an IP address: TLS verify-full checks the host name on the certificate - use the host name';
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(caPem)) return 'FACTORY_DB_CA_PEM is unset or not a PEM certificate: TLS verify-full needs the database server CA';
  return null;
}

/** postgres.js options: TLS verify-full against the pinned CA; no prepared statements (the pooler's transaction mode) */
export function dbOptions(caPem: string, pool = 4): Record<string, unknown> {
  return { prepare: false, max: pool, idle_timeout: 20, connect_timeout: 10, ssl: { ca: caPem, rejectUnauthorized: true } };
}

/** the SQLSTATE of an error the PostgreSQL SERVER sent, or null. postgres.js raises the server's ErrorResponse as a PostgresError, which
 *  always carries the server's severity; only that is the server answering (it rolled the call back). A driver or transport error is
 *  never read as one, whatever its code: Node and Deno name some socket errors with five capitals too (EPIPE, EPERM, EBUSY), and after
 *  such an error whether the call ran is unknown. */
export function serverSqlState(e: unknown): string | null {
  if (!(e instanceof Error) || e.name !== 'PostgresError') return null;
  const x = e as Error & { code?: unknown; severity?: unknown; severity_local?: unknown };
  const fromServer = typeof x.severity === 'string' || typeof x.severity_local === 'string';
  return fromServer && typeof x.code === 'string' && /^[0-9A-Z]{5}$/.test(x.code) ? x.code : null;
}
