// DATABASE URLS FOR THE EDGE DATABASE MODULE'S TARGET ROWS (C2-S1; S-10 "the production project is refused") - data only, no I/O, so
// the same lists run under Deno (edge_db_tls_acceptance T7-T9, with the driver the functions import) and under Node.
//
//   GOOD          URLs in the one form _shared/db.ts reads, each with the target it must read from them
//   adversarial   URLs that reach, or try to reach, the production project without spelling it in the form the old text check looked
//                 for: each must be refused. `kind` names the family (the founder's list for C2-S1): percent encoding, case
//                 normalization, escaped characters, equivalent hostname forms, URL parsing differences, whitespace / wrapper
//                 representations, alternate connection-string forms
//   ODD           URLs that name no production project but are outside the one form: each must be refused, with a reason matching `why`
//   names         does a postgres.js options object (what the driver would connect with) name a project ref anywhere in its target?

/** one character of `s` as a percent-escape (lower-case hex unless `upper`) */
export const escapeAt = (s, i, upper = false) => s.slice(0, i) + '%' + s.charCodeAt(i).toString(16)[upper ? 'toUpperCase' : 'toLowerCase']() + s.slice(i + 1);
/** every character of `s` as a percent-escape */
export const escapeAll = (s) => [...s].map((c) => '%' + c.charCodeAt(0).toString(16)).join('');
/** `s` with `x` put between its 9th and 10th characters */
export const split = (s, x) => s.slice(0, 9) + x + s.slice(9);

const POOL = 'aws-0-ap-southeast-1.pooler.supabase.com';
const FACTORY = 'npvhuoozkbexddnvkqsj';

export const GOOD = [
  ['the form the founder\'s steps give (the pooler, the Factory API login)', 'postgresql://factory_node_api.' + FACTORY + ':Pw0rd-x_y.z~@' + POOL + ':6543/postgres',
    { host: POOL, port: 6543, user: 'factory_node_api.' + FACTORY, password: 'Pw0rd-x_y.z~', database: 'postgres' }],
  ['the postgres:// spelling of the scheme', 'postgres://factory_admin_api.' + FACTORY + ':pw@' + POOL + ':6543/postgres',
    { host: POOL, port: 6543, user: 'factory_admin_api.' + FACTORY, password: 'pw', database: 'postgres' }],
  ['a host written in upper case is read in lower case', 'postgresql://api:pw@AWS-0-AP-Southeast-1.Pooler.Supabase.COM:6543/postgres',
    { host: POOL, port: 6543, user: 'api', password: 'pw', database: 'postgres' }],
  ['percent-escapes and a colon in the password, decoded once', 'postgresql://api:p%40ss%2Fw%3Ard%25:x%20y@db.example.net:5432/factory_db',
    { host: 'db.example.net', port: 5432, user: 'api', password: 'p@ss/w:rd%:x y', database: 'factory_db' }],
  ['a doubly escaped password is decoded once, not twice', 'postgresql://api:%2570w@db.example.net:5432/postgres',
    { host: 'db.example.net', port: 5432, user: 'api', password: '%70w', database: 'postgres' }],
  ['percent-escapes in the user name, decoded once', 'postgresql://factory%5Fnode%5Fapi%2E' + FACTORY + ':pw@' + POOL + ':6543/postgres',
    { host: POOL, port: 6543, user: 'factory_node_api.' + FACTORY, password: 'pw', database: 'postgres' }],
  ['a single-label host name (a disposable plane)', 'postgresql://postgres:pw@localhost:54329/postgres',
    { host: 'localhost', port: 54329, user: 'postgres', password: 'pw', database: 'postgres' }],
];

/** URLs that would reach project `ref` - by its direct host, its pooler tenant, a startup parameter - in a disguised or alternate form */
export function adversarial(ref) {
  const out = [];
  const add = (kind, what, url) => out.push({ kind, what, url });
  const host = (r) => 'postgresql://u:p@db.' + r + '.supabase.co:5432/postgres';
  const user = (r) => 'postgresql://postgres.' + r + ':p@' + POOL + ':6543/postgres';
  const opt = (r) => 'postgresql://u:p@' + POOL + ':6543/postgres?options=reference%3D' + r;
  const quser = (r) => 'postgresql://u:p@' + POOL + ':6543/postgres?user=postgres.' + r;
  const carriers = [['the direct host', host], ['the pooler user', user], ['?options=reference', opt], ['?user=', quser]];

  // ---- percent encoding
  for (const [where, f] of carriers) {
    add('percent encoding', 'one letter of the ref escaped, in ' + where, f(escapeAt(ref, 17)));
    add('percent encoding', 'one letter escaped in upper-case hex, in ' + where, f(escapeAt(ref, 0, true)));
    add('percent encoding', 'every letter of the ref escaped, in ' + where, f(escapeAll(ref)));
    add('percent encoding', 'the ref escaped twice, in ' + where, f(escapeAt(ref, 17).replace('%', '%25')));
  }
  add('percent encoding', 'the dot before the ref and a letter of it escaped, in the pooler user', 'postgresql://postgres%2E' + escapeAt(ref, 3) + ':p@' + POOL + ':6543/postgres');
  add('percent encoding', 'the "=" of options=reference= and a letter of the ref escaped', 'postgresql://u:p@' + POOL + ':6543/postgres?options=reference%3d' + escapeAt(ref, 8));
  add('percent encoding', 'an escaped ref as the database name', 'postgresql://u:p@' + POOL + ':6543/' + escapeAt(ref, 2));
  add('percent encoding', 'an escaped ref inside the password (decoded, it is in what the driver is given)', 'postgresql://u:' + escapeAt(ref, 5) + '@' + POOL + ':6543/postgres');
  // ---- case normalization
  for (const [where, f] of carriers) add('case normalization', 'the ref in upper case, in ' + where, f(ref.toUpperCase()));
  add('case normalization', 'the whole URL in upper case', host(ref).toUpperCase());
  add('case normalization', 'the ref in mixed case with one letter escaped, in the pooler user', user(escapeAt(ref.slice(0, 10).toUpperCase() + ref.slice(10), 15)));
  add('case normalization', 'the scheme in upper case and a letter of the ref escaped, in the pooler user', user(escapeAt(ref, 6)).replace('postgresql', 'POSTGRESQL'));
  // ---- whitespace and wrappers
  for (const [where, f] of carriers) {
    add('whitespace', 'a tab inside the ref, in ' + where, f(split(ref, '\t')));
    add('whitespace', 'a line feed inside the ref, in ' + where, f(split(ref, '\n')));
    add('whitespace', 'a carriage return and line feed inside the ref, in ' + where, f(split(ref, '\r\n')));
    add('whitespace', 'a space inside the ref, in ' + where, f(split(ref, ' ')));
  }
  add('whitespace', 'a space before the URL and a letter of the ref escaped', ' ' + user(escapeAt(ref, 4)));
  add('whitespace', 'a line feed after the URL and a letter of the ref escaped', user(escapeAt(ref, 4)) + '\n');
  add('whitespace', 'a tab inside the scheme and inside the ref', host(split(ref, '\t')).replace('postgresql', 'postgre\tsql'));
  add('whitespace', 'a NUL inside the ref', host(split(ref, '\u0000')));
  add('whitespace', 'a zero-width space inside the ref', host(split(ref, '​')));
  add('whitespace', 'a soft hyphen inside the ref', host(split(ref, '­')));
  add('whitespace', 'a full-width letter in place of the first letter of the ref', host(String.fromCharCode(0xff00 + ref.charCodeAt(0) - 0x20) + ref.slice(1)));
  add('wrapper', 'the URL in double quotes, a letter of the ref escaped', '"' + user(escapeAt(ref, 4)) + '"');
  add('wrapper', 'the URL in single quotes, a letter of the ref escaped', '\'' + user(escapeAt(ref, 4)) + '\'');
  add('wrapper', 'the URL in angle brackets, a letter of the ref escaped', '<' + user(escapeAt(ref, 4)) + '>');
  add('wrapper', 'a variable assignment before the URL, a letter of the ref escaped', 'FACTORY_NODE_DB_URL=' + user(escapeAt(ref, 4)));
  // ---- escaped characters
  add('escaped characters', 'a backslash-escaped tab written out (two characters) inside the ref', host(split(ref, '\\t')));
  add('escaped characters', 'a \\u escape written out for a letter of the ref', host('\\u00' + ref.charCodeAt(0).toString(16) + ref.slice(1)));
  add('escaped characters', 'an HTML character reference for a letter of the ref', host('&#' + ref.charCodeAt(0) + ';' + ref.slice(1)));
  add('escaped characters', 'backslashes for the slashes of the scheme, a letter of the ref escaped', user(escapeAt(ref, 4)).replace('://', ':\\\\'));
  // ---- equivalent hostname forms
  add('equivalent hostname forms', 'a trailing dot on the host, a tab inside the ref', 'postgresql://u:p@db.' + split(ref, '\t') + '.supabase.co.:5432/postgres');
  add('equivalent hostname forms', 'an escaped dot in the host and an escaped letter of the ref', 'postgresql://u:p@db%2E' + escapeAt(ref, 1) + '.supabase.co:5432/postgres');
  add('equivalent hostname forms', 'a decoy host before a second "@"', 'postgresql://u:p@decoy.example.net@db.' + escapeAt(ref, 1) + '.supabase.co:5432/postgres');
  add('equivalent hostname forms', 'the host with no user or password before it, a tab inside the ref', 'postgresql://db.' + split(ref, '\t') + '.supabase.co:5432/postgres');
  // ---- URL parsing differences (what one parser reads as the target and another does not)
  add('URL parsing differences', 'a list of hosts whose first is the escaped direct host', 'postgresql://u:p@db.' + escapeAt(ref, 17) + '.supabase.co,standby.example.net:5432/postgres');
  add('URL parsing differences', 'a list of hosts whose second is the escaped direct host', 'postgresql://u:p@standby.example.net,db.' + escapeAt(ref, 17) + '.supabase.co:5432/postgres');
  add('URL parsing differences', 'a list of hosts written with an escaped comma', 'postgresql://u:p@standby.example.net%2Cdb.' + escapeAt(ref, 17) + '.supabase.co:5432/postgres');
  add('URL parsing differences', '?user= given twice, the second the escaped pooler user', 'postgresql://u:p@' + POOL + ':6543/postgres?user=api&user=postgres.' + escapeAt(ref, 3));
  add('URL parsing differences', '?database= naming an escaped ref', 'postgresql://u:p@' + POOL + ':6543/postgres?database=' + escapeAt(ref, 3));
  add('URL parsing differences', '?host= naming the escaped direct host', 'postgresql://u:p@' + POOL + ':6543/postgres?host=db.' + escapeAt(ref, 3) + '.supabase.co');
  add('URL parsing differences', '?options= with "+" for a space and an escaped ref', 'postgresql://u:p@' + POOL + ':6543/postgres?options=-c+search_path%3Dx+reference%3D' + escapeAt(ref, 3));
  add('URL parsing differences', 'the escaped pooler user after an escaped "@" in the user part', 'postgresql://u%40postgres.' + escapeAt(ref, 3) + ':p@' + POOL + ':6543/postgres');
  add('URL parsing differences', 'no user and no password, the pooler user given by an escaped ?user=', 'postgresql://' + POOL + ':6543/postgres?user=postgres.' + escapeAt(ref, 3));
  add('URL parsing differences', 'a fragment carrying the escaped pooler user', 'postgresql://u:p@' + POOL + ':6543/postgres#postgres.' + escapeAt(ref, 3));
  add('URL parsing differences', 'a second path segment carrying an escaped ref', 'postgresql://u:p@' + POOL + ':6543/postgres/' + escapeAt(ref, 3));
  add('URL parsing differences', 'one slash after the scheme, a letter of the ref escaped', user(escapeAt(ref, 4)).replace('://', ':/'));
  add('URL parsing differences', 'no slash after the scheme, a letter of the ref escaped', user(escapeAt(ref, 4)).replace('://', ':'));
  // ---- alternate connection-string forms
  add('alternate forms', 'libpq keywords, a tab inside the ref', 'host=db.' + split(ref, '\t') + '.supabase.co port=5432 user=u password=p dbname=postgres');
  add('alternate forms', 'libpq keywords for the pooler, a letter of the ref escaped', 'host=' + POOL + ' port=6543 user=postgres.' + escapeAt(ref, 3) + ' password=p dbname=postgres');
  add('alternate forms', 'a jdbc: URL, a letter of the ref escaped', 'jdbc:' + user(escapeAt(ref, 4)));
  add('alternate forms', 'another scheme (postgresql+ssl), a letter of the ref escaped', user(escapeAt(ref, 4)).replace('postgresql://', 'postgresql+ssl://'));
  add('alternate forms', 'a JSON object, a tab inside the ref', JSON.stringify({ host: 'db.' + ref + '.supabase.co', user: 'u' }).replace(ref, split(ref, '\t')));
  add('alternate forms', 'the pgpass form, a letter of the ref escaped', POOL + ':6543:postgres:postgres.' + escapeAt(ref, 3) + ':p');
  return out;
}

/** URLs that name no production project and are outside the one form */
export const ODD = [
  ['no port', 'postgresql://api:pw@db.example.net/postgres', /port/],
  ['port 0', 'postgresql://api:pw@db.example.net:0/postgres', /port/],
  ['port 65536', 'postgresql://api:pw@db.example.net:65536/postgres', /port/],
  ['a six-digit port', 'postgresql://api:pw@db.example.net:654321/postgres', /port/],
  ['no password', 'postgresql://api@db.example.net:5432/postgres', /password/],
  ['an empty password', 'postgresql://api:@db.example.net:5432/postgres', /password/],
  ['no user', 'postgresql://:pw@db.example.net:5432/postgres', /user/],
  ['no user and no password', 'postgresql://db.example.net:5432/postgres', /no user, host or database part/],
  ['no database', 'postgresql://api:pw@db.example.net:5432/', /database/],
  ['no path', 'postgresql://api:pw@db.example.net:5432', /no user, host or database part/],
  ['a query (sslmode)', 'postgresql://api:pw@db.example.net:5432/postgres?sslmode=require', /query/],
  ['a query (options)', 'postgresql://api:pw@db.example.net:5432/postgres?options=-c%20statement_timeout%3D0', /query/],
  ['a fragment', 'postgresql://api:pw@db.example.net:5432/postgres#x', /fragment/],
  ['an IPv4 address', 'postgresql://api:pw@203.0.113.7:5432/postgres', /IP address/],
  ['an IPv6 address', 'postgresql://api:pw@[2001:db8::7]:5432/postgres', /IP address/],
  ['an IPv4 address as one decimal number', 'postgresql://api:pw@3405803783:5432/postgres', /IP address/],
  ['an IPv4 address in hex', 'postgresql://api:pw@0xcb007107:5432/postgres', /IP address/],
  ['an IPv4 address in short form', 'postgresql://api:pw@203.7:5432/postgres', /IP address/],
  ['a name whose last label is a number', 'postgresql://api:pw@db.example.7:5432/postgres', /IP address/],
  ['an empty host', 'postgresql://api:pw@:5432/postgres', /IP address|host/],
  ['a list of hosts', 'postgresql://api:pw@a.example.net,b.example.net:5432/postgres', /DNS name/],
  ['a trailing dot on the host', 'postgresql://api:pw@db.example.net.:5432/postgres', /DNS name/],
  ['a percent-escape in the host', 'postgresql://api:pw@db%2Eexample.net:5432/postgres', /DNS name/],
  ['an underscore in the host', 'postgresql://api:pw@db_1.example.net:5432/postgres', /DNS name/],
  ['a host label that begins with a hyphen', 'postgresql://api:pw@-db.example.net:5432/postgres', /DNS name/],
  ['a backslash in the host', 'postgresql://api:pw@db.example.net\\x:5432/postgres', /DNS name/],
  ['a "%" that begins no escape, in the password', 'postgresql://api:p%zz@db.example.net:5432/postgres', /escape/],
  ['a "%" with one digit, in the user', 'postgresql://ap%4:pw@db.example.net:5432/postgres', /escape/],
  ['an escaped space in the user', 'postgresql://a%20pi:pw@db.example.net:5432/postgres', /user name/],
  ['an escaped "%" in the user', 'postgresql://a%25pi:pw@db.example.net:5432/postgres', /user name/],
  ['an escaped NUL in the password', 'postgresql://api:p%00w@db.example.net:5432/postgres', /password/],
  ['an escaped byte outside ASCII in the password', 'postgresql://api:p%C3%A9w@db.example.net:5432/postgres', /password/],
  ['a percent-escape in the database name', 'postgresql://api:pw@db.example.net:5432/post%67res', /database name/],
  ['a second path segment', 'postgresql://api:pw@db.example.net:5432/postgres/x', /more than one "@" or/],
  ['a second "@"', 'postgresql://api:p@w@db.example.net:5432/postgres', /more than one "@" or/],
  ['a space before the URL', ' postgresql://api:pw@db.example.net:5432/postgres', /space/],
  ['a line feed after the URL', 'postgresql://api:pw@db.example.net:5432/postgres\n', /line break/],
  ['a tab inside the host', 'postgresql://api:pw@db.exa\tmple.net:5432/postgres', /tab/],
  ['a character outside ASCII in the host', 'postgresql://api:pw@db.exämple.net:5432/postgres', /outside ASCII/],
  ['the URL in double quotes', '"postgresql://api:pw@db.example.net:5432/postgres"', /postgresql:\/\/ URL/],
  ['a variable assignment before the URL', 'FACTORY_NODE_DB_URL=postgresql://api:pw@db.example.net:5432/postgres', /postgresql:\/\/ URL/],
  ['libpq keywords', 'host=db.example.net port=5432 user=api password=pw dbname=postgres', /space|postgresql:\/\/ URL/],
  ['an https URL', 'https://db.example.net:5432/postgres', /postgresql:\/\/ URL/],
  ['a jdbc URL', 'jdbc:postgresql://api:pw@db.example.net:5432/postgres', /postgresql:\/\/ URL/],
];

/** does this postgres.js options object - the driver's own reading of what it was constructed with - name `ref` in its target: a
 *  host, a socket path, the user, the database or a startup parameter (and, with `password`, the password it would send)? */
export function names(options, ref, { password = false } = {}) {
  const startup = Object.entries(options.connection || {}).filter(([k]) => k !== 'application_name');
  const target = [options.host, options.path, options.user, options.database, startup, password ? options.pass : null];
  return JSON.stringify(target).toLowerCase().includes(ref);
}
/** the target of a postgres.js options object, in dbTarget's shape (null when the driver reads more than one host) */
export function targetOf(options) {
  if (!Array.isArray(options.host) || options.host.length !== 1 || options.path) return null;
  return { host: options.host[0], port: options.port[0], user: options.user, password: options.pass, database: options.database };
}
