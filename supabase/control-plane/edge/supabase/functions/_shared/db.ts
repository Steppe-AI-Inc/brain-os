// THE FACTORY DATABASE CONNECTION of both Edge Functions (S-10: "TLS is verify-full"; "the production project is refused").
// Portable: the entry points (Deno) and the developer suites (Node and Deno) use the same functions; the two API handlers read a
// server error through serverSqlState (below).
//
// THE URL IS READ ONCE, HERE (dbTarget), AND THE DRIVER IS NEVER HANDED IT: it is given the host, port, user, password and database
// this file read (dbOptions). A refusal judged on the URL's text while the driver reads that text again by its own rules judges one
// target and connects to another. postgres.js percent-decodes the user name, takes ?user= and ?options= as startup parameters (a
// pooler picks the project from either), reads a list of hosts, fills what the URL leaves out from its environment, and its URL
// parser drops a tab or a line break from inside a name: each let a URL that did not spell the production project in its text
// reach it (C2-S1; edge_db_tls_acceptance T8 holds the forms). So exactly ONE form is read -
//     postgresql://USER:PASS@HOST:PORT/DATABASE
// - every part present, nothing before or after it, no query and no fragment; the host a plain DNS name, taken in lower case; a
// percent-escape only in the user name and the password, decoded once, here. Everything else is refused (fail closed), and the
// production project is refused on what was read - the host, the user, the database and the password as the driver is given them -
// as well as on the text.
//
// VERIFY-FULL. postgres.js merges an `ssl` object into tls.connect with the host it is given as the servername, so { ca } means: the
// server's certificate must chain to THIS CA and name that host. ('require' - what a plain URL gives - encrypts and
// verifies nothing: any server that answers TLS would do.) The CA is the Factory project's database server CA, a public certificate
// the founder downloads from the project settings and stores as FACTORY_DB_CA_PEM (not a secret, but never a value this source
// supplies: a wrong or stale one fails closed).
export const PRODUCTION_REF = 'pvphxgrtdfrudejjhzjk';

/** what a database URL names, as this file read it: the only thing the driver is given */
export type DbTarget = { host: string; port: number; user: string; password: string; database: string };
type DbRead = { why: string; target: null } | { why: null; target: DbTarget };

const PRODUCTION = 'the database URL names the Brain OS production project';
const no = (why: string): DbRead => ({ why, target: null });
// a two-digit percent-escape, decoded as one character (only escapes of printable ASCII pass the checks made on the result)
const unescaped = (s: string): string => s.replace(/%([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** the target the database URL names, or why no connection may be opened to it. Every test here only refuses; nothing is defaulted. */
export function dbTarget(url: string): DbRead {
  if (!url) return no('the database URL is unset');
  if (url.toLowerCase().includes(PRODUCTION_REF)) return no(PRODUCTION);
  if (!/^[\x21-\x7e]+$/.test(url)) return no('the database URL has a space, a tab, a line break, a control character or a character outside ASCII in it: write it on one line, as postgresql://USER:PASS@HOST:PORT/DATABASE');
  if (!/^postgres(ql)?:\/\//i.test(url)) return no('the database URL is not a postgresql:// URL');
  const parts = /^[a-z]+:\/\/([^@/?#]*)@([^@/?#]*)\/([^@/?#]*)$/i.exec(url);
  if (!parts) return no('the database URL is not postgresql://USER:PASS@HOST:PORT/DATABASE: it has a query, a fragment, more than one "@" or "/" after the scheme, or no user, host or database part');
  const login = /^([^:]+):(.+)$/.exec(parts[1]);
  if (!login) return no('the database URL names no user or carries no password: both are written in the URL (the driver would take a missing one from its environment)');
  const address = /^(.*):([0-9]{1,5})$/.exec(parts[2]);
  if (!address) return no('the database URL names no port: write host:port (the driver would take a missing port from its environment)');
  const host = address[1].toLowerCase();
  const port = Number(address[2]);
  if (port < 1 || port > 65535) return no('the database URL names a port outside 1..65535');
  // an IP literal carries no name to check: postgres.js then sends no servername, and the certificate's name goes unchecked
  // (edge_db_tls_acceptance T3a measured a "localhost" certificate accepted at an IP address). Verify-full needs the host NAME. A
  // resolver also reads a name whose last label is a number (decimal or 0x hex) as an IPv4 address, whatever comes before it.
  const ipv4 = /^(0x[0-9a-f]*|[0-9]+)$/.test(host.slice(host.lastIndexOf('.') + 1));
  const ipv6 = /[[\]:]/.test(host);
  if (!host || ipv4 || ipv6) return no('the database URL names an IP address: TLS verify-full checks the host name on the certificate - use the host name');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return no('the database URL\'s host is not a plain DNS name (letters, digits, hyphens, dots between labels): a percent-escape, a list of hosts, a trailing dot or any other character is refused');
  if (/%(?![0-9A-Fa-f]{2})/.test(parts[1])) return no('the database URL has a "%" in its user name or password that does not begin a two-digit escape');
  const user = unescaped(login[1]);
  const password = unescaped(login[2]);
  const database = parts[3];
  if (!/^[A-Za-z0-9._-]+$/.test(user)) return no('the database URL\'s user name, once decoded, has a character other than letters, digits, ".", "_" and "-" in it');
  if (!/^[\x20-\x7e]+$/.test(password)) return no('the database URL\'s password, once decoded, has a control character or a character outside ASCII in it');
  if (!/^[A-Za-z0-9_-]+$/.test(database)) return no('the database URL\'s database name has a character other than letters, digits, "_" and "-" in it (a percent-escape is not read there)');
  // the production project, on what was READ: the parts the driver is given, each as it is given
  const effective = [host, user, database, password].join('\n');
  if (effective.toLowerCase().includes(PRODUCTION_REF)) return no(PRODUCTION);
  return { why: null, target: { host, port, user, password, database } };
}

/** why this function must not open a database connection at all, or null */
export function dbRefusal(url: string, caPem: string): string | null {
  const read = dbTarget(url);
  if (read.target === null) return read.why;
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(caPem)) return 'FACTORY_DB_CA_PEM is unset or not a PEM certificate: TLS verify-full needs the database server CA';
  return null;
}

/** postgres.js options - the driver's ONLY argument: the target read from the URL (never the URL), TLS verify-full against the pinned
 *  CA, and no prepared statements (the pooler's transaction mode). A URL dbTarget refuses gives no options: it throws. */
export function dbOptions(url: string, caPem: string, pool = 4): Record<string, unknown> {
  const read = dbTarget(url);
  if (read.target === null) throw new Error('no database connection: ' + read.why);
  const { host, port, user, password, database } = read.target;
  return { host, port, user, password, database, prepare: false, max: pool, idle_timeout: 20, connect_timeout: 10, ssl: { ca: caPem, rejectUnauthorized: true } };
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
