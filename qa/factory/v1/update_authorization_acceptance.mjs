#!/usr/bin/env node
// FACTORY -> UPDATE: THE AUTHORIZATION (founder decision 2026-10-03; S-5, S-8; WO-6) - DEVELOPER VERIFICATION, never independent.
// The founder holds no release key. A release is signed by the plane's signer and published in one transaction, by
// factory.admin_authorize_update, when - and only when - the caller is the founder by the one definition (tier founder in
// tenant_admins AND the live Brain OS role founder) and its token states a password entry of that account made in the last two
// minutes that authorized no other release. Through the real Admin API handler, a plane with its own signer, and the Brain OS stub.
//   UE  the handler (no database): what it reads from the token and hands the front door, and what it does with the answer
//     UE1 `reauth` is the token's own password entry and session, added after the whitelist; a token that states none gives null;
//         no other action carries it
//     UE2 a body that names `reauth` (or a key id, a signature, a manifest) is refused 400 before Brain OS or the plane is asked
//     UE3 the signed manifest is placed in release storage only after the front door answered a published release; a refusal places
//         nothing; storage that does not take it is said as manifest_served false, the release still answered; storage that does
//         not answer at all is an error at the request boundary (503, outcome unknown), never an answer
//     UE4 the storage writer puts ONE object - production/<version>/BrainFactorySetup.manifest.json - at the project's own address
//         with the platform's key; it answers false for a refusal, no configuration or a bad version, and lets "no answer" through
//         as the error it is
//   UA  the front door, through the handler, on a plane with a signer
//     UA1 the founder with a fresh password entry: the release is published, signed by this plane's signer; the installer's own
//         verifier accepts the manifest with that key pinned; the record names the session and the entry; the manifest is in storage
//     UA2 without a fresh entry it is refused reauth_required, audited, and nothing is signed or written: an ordinary session
//         token, an entry three minutes old, an entry from the future, another sign-in method, no session, a malformed session
//     UA3 an entry 100 seconds old is accepted
//     UA4 nobody but the founder, each WITH a fresh password entry: an admin of tier admin, a holding_admin listed as tier founder,
//         a listed admin who made its own profiles.role founder (S1), a founder role not in tenant_admins, a self-promoted employee,
//         hr_finance, no token and another project's token - each refused with no data, and nothing signed or written
//     UA5 one entry, one release: the same entry for another release is refused reauth_used; for the same release it is "already"
//     UA6 exactly what was named is signed, and a newer release supersedes the older one
//     UA7 what is not an update is refused by name: another channel, a malformed value, a version or digest published before
//     UA8 storage down: the release is published, manifest_served false; authorizing it again answers "already" and places the
//         manifest - no second signature, no second release
//     UA9 a stored seed that is not this plane's key: signer_unavailable, nothing published
//     UA10 the signer's key revoked: key_revoked, nothing published
//   UW  the page's part: web/lib/factory/reauth.ts (the password check) and update.ts (what is authorized, in which order) - the two
//       files as the web app runs them. The server action that wires them (lib/data/factory-update.ts) needs next dev: not run here
//     UW1 the password check is Brain OS's own password sign-in for the account's own email: a correct password opens a NEW session
//         whose token states the entry; ending it (scope=local) ends that token and leaves the page's session alone
//     UW2 a wrong password is refused by Brain OS and named wrong_password; an answer for another account, no answer and a
//         rate limit are refusals too; no refusal carries the password
//     UW3 one confirmation walks a fixed order and stops at the first refusal, before the password is checked: no session, no
//         password, not a Factory admin, nothing prepared, a prepared release that changed, an installer storage does not serve or
//         serves with another digest; a wrong password never reaches the Factory
//     UW4 the founder, the right password, the prepared release as storage serves it: the Factory signs and publishes exactly it,
//         and the fresh session is ended; it is ended also when the Factory refuses (an admin who is not the founder)
//     UW5 the password goes to the password check and nowhere else: no other dependency receives it, and it is in no answer, no
//         response body of the Admin API, no log event, no audit row and no release row
//     UW6 what counts as a prepared update: the release tool's unsigned production manifest, and nothing signed, of another
//         channel or malformed
// usage: node qa/factory/v1/update_authorization_acceptance.mjs [--evidence <file>]
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { world, recorder } from './flows.mjs';
import { NO_REVOCATIONS, verifyRelease } from '../../../scripts/factory-runner/enrolled/release.mjs';

const EDGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'control-plane', 'edge', 'supabase', 'functions', '_shared');
const WEBLIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'lib', 'factory');
const { passwordReauth } = await import(pathToFileURL(join(WEBLIB, 'reauth.ts')).href);
const { authorizePreparedUpdate, parsePrepared } = await import(pathToFileURL(join(WEBLIB, 'update.ts')).href);
const { createAdminApi, passwordEntry } = await import(pathToFileURL(join(EDGE, 'admin_api.ts')).href);
const { manifestStore, manifestText } = await import(pathToFileURL(join(EDGE, 'release_storage.ts')).href);
const { results, row } = recorder();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const claims = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
const REL = (v, extra = {}) => ({ channel: 'production', version: v, source_sha: 'a'.repeat(40), digest: sha256('artifact ' + v), receipt_sha256: 'c'.repeat(64), ...extra });
const nodata = (r) => r.ok === false && Object.keys(r).every((k) => ['ok', 'refused', 'message', 'http'].includes(k));

const W = await world();
const { admin, brain, sup, founder, plane } = W;
const signer = plane.signer;
const pinned = { channel: 'production', mode: 'production', keys: [{ key_id: signer.key_id, public_key: signer.public_key }] };
const authz = (body, token) => admin.call('authorize-update', body, token);
// every release and revocation row of the plane, hashed; the audit log is read apart
const written = async () => (await sup.query(`select md5(coalesce((select string_agg(to_jsonb(r)::text, '|' order by r.release_id) from factory.releases r), '')
    || '#' || coalesce((select string_agg(to_jsonb(v)::text, '|' order by v.revocation_id) from factory.release_revocations v), '')) h`)).rows[0].h;
const audited = async (reason) => (await sup.query(`select count(*)::int n from factory.audit_events where action = 'admin.authorize_update' and outcome = 'refused' and reason = $1`, [reason])).rows[0].n;
const releaseRow = async (id) => (await sup.query(`select r.*, extract(epoch from r.authorized_password_at)::bigint pw_epoch from factory.releases r where r.release_id = $1`, [id])).rows[0];

try {
  // ================================================================= UE: the handler alone
  {
    const BRAIN = brain.url;
    const calls = [];
    const stored = [];
    let answer = { ok: true, release_id: randomUUID(), manifest: { v: 1, channel: 'production', version: '7.0.0' } };
    let storeAnswers = true;
    const api = (withStore = true) => createAdminApi({
      sql: async (text, params) => { calls.push({ text, body: JSON.parse(params[2]) }); return [{ r: answer }]; },
      randomBytes: (n) => new Uint8Array(n), pepper: async () => null, brainOs: { url: BRAIN, anonKey: brain.anonKey }, fetch: (u, i) => fetch(u, i),
      ...(withStore ? { storeManifest: async (version, manifest) => { stored.push({ version, manifest }); return storeAnswers; } } : {}),
    });
    const post = async (h, op, body, token) => { const r = await h(new Request('http://x/v1/admin/' + op, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) })); return { ...(await r.json()), http: r.status }; };
    const h = api();
    const tFresh = brain.passwordToken(founder), cFresh = claims(tFresh);
    await post(h, 'authorize-update', REL('7.0.0'), tFresh);
    const withEntry = calls.at(-1).body.reauth;
    await post(h, 'authorize-update', REL('7.0.0'), founder.token);
    const without = calls.at(-1).body;
    await post(h, 'list-releases', {}, tFresh);
    const other = calls.at(-1).body;
    const latest = brain.tokenWith(founder, { session_id: randomUUID(), amr: [{ method: 'password', timestamp: 100 }, { method: 'otp', timestamp: 900 }, { method: 'password', timestamp: 500 }, null, { method: 'password', timestamp: '700' }] });
    row('UE1 `reauth` handed to the front door is the token\'s own password entry and session ({ password_at, session_id }), added by the handler; a token that states no password entry gives reauth null; of several entries the latest password entry counts (never another method\'s time, never a time that is not a number); no other action carries `reauth`',
      withEntry && withEntry.password_at === cFresh.amr[0].timestamp && withEntry.session_id === cFresh.session_id && 'reauth' in without && without.reauth === null
        && !('reauth' in other) && passwordEntry(latest).password_at === 500,
      JSON.stringify({ withEntry, without: without.reauth, other: Object.keys(other), latest: passwordEntry(latest).password_at }));

    const before = calls.length; const asked = brain.grants.ok;
    const forged = {};
    for (const [name, extra] of Object.entries({ reauth: { reauth: { password_at: Math.floor(Date.now() / 1000), session_id: randomUUID() } }, key_id: { key_id: signer.key_id }, signature: { signature: 'A'.repeat(86) }, manifest: { manifest: {} } })) {
      const r = await post(h, 'authorize-update', REL('7.0.1', extra), founder.token); forged[name] = r.http + ' ' + r.refused;
    }
    row('UE2 a body that names `reauth`, a key id, a signature or a manifest is refused 400 bad_request, and the front door is not called',
      Object.values(forged).every((v) => v === '400 bad_request') && calls.length === before && brain.grants.ok === asked, JSON.stringify(forged));

    stored.length = 0;
    const ok1 = await post(h, 'authorize-update', REL('7.0.0'), tFresh);
    storeAnswers = false;
    const ok2 = await post(h, 'authorize-update', REL('7.0.0'), tFresh);
    storeAnswers = true;
    const noStore = await post(api(false), 'authorize-update', REL('7.0.0'), tFresh);
    const putsBeforeRefusal = stored.length;
    answer = { ok: false, refused: 'reauth_required', http: 403, message: 'x' };
    const refusedAnswer = await post(h, 'authorize-update', REL('7.0.0'), tFresh);
    answer = { ok: true, release_id: randomUUID() };   // an answer without a manifest places nothing
    const noManifest = await post(h, 'authorize-update', REL('7.0.0'), tFresh);
    answer = { ok: true, release_id: randomUUID(), manifest: { v: 1, channel: 'production', version: '7.0.0' } };
    const silent = await post(createAdminApi({ sql: async () => [{ r: answer }], randomBytes: (n) => new Uint8Array(n), pepper: async () => null,
      brainOs: { url: BRAIN, anonKey: brain.anonKey }, fetch: (u, i) => fetch(u, i), storeManifest: async () => { throw Object.assign(new Error('no route to storage'), { name: 'TypeError' }); } }), 'authorize-update', REL('7.0.0'), tFresh);
    row('UE3 the signed manifest is placed in release storage only after the front door answered a published release, under the manifest\'s version: placed -> manifest_served true; storage not taking it -> false with the release still answered; no storage configured -> false; a refusal, or an answer without a manifest, places nothing; storage that does not answer at all is 503 unavailable (outcome unknown: reload), never an answer',
      ok1.ok === true && ok1.manifest_served === true && stored[0].version === '7.0.0' && ok2.ok === true && ok2.manifest_served === false && noStore.ok === true && noStore.manifest_served === false
        && refusedAnswer.http === 403 && !('manifest_served' in refusedAnswer) && noManifest.manifest_served === false && stored.length === putsBeforeRefusal
        && silent.http === 503 && silent.refused === 'unavailable' && !('manifest' in silent),
      JSON.stringify({ ok1: ok1.manifest_served, ok2: ok2.manifest_served, noStore: noStore.manifest_served, refused: refusedAnswer.refused, noManifest: noManifest.manifest_served, puts: stored.length, silent: silent.http + ' ' + silent.refused }));

    const sent = [];
    const fakeFetch = (status) => async (url, init) => { sent.push({ url: String(url), init }); if (status === 'throw') throw new Error('no route'); return new Response('{}', { status }); };
    const m = { v: 1, channel: 'production', version: '1.2.3+b.7', digest: 'd'.repeat(64) };
    const put = await manifestStore({ url: 'https://abcdefghijklmnopqrst.supabase.co/', key: 'KEY', fetch: fakeFetch(200) })('1.2.3+b.7', m);
    const one = sent[0];
    const facts = {
      put, url: one.url, method: one.init.method, auth: one.init.headers.authorization === 'Bearer KEY' && one.init.headers.apikey === 'KEY', upsert: one.init.headers['x-upsert'],
      body: one.init.body === manifestText(m) && one.init.body === JSON.stringify(m, null, 2) + '\n',
      refused: await manifestStore({ url: 'https://x.supabase.co', key: 'KEY', fetch: fakeFetch(403) })('1.2.3', m),
      threw: await manifestStore({ url: 'https://x.supabase.co', key: 'KEY', fetch: fakeFetch('throw') })('1.2.3', m).then(() => 'ANSWERED', (e) => 'error: ' + e.message),
      noUrl: await manifestStore({ url: '', key: 'KEY', fetch: fakeFetch(200) })('1.2.3', m),
      noKey: await manifestStore({ url: 'https://x.supabase.co', key: '', fetch: fakeFetch(200) })('1.2.3', m),
      badVersion: await manifestStore({ url: 'https://x.supabase.co', key: 'KEY', fetch: fakeFetch(200) })('../1.2.3', m),
      requests: sent.length,
    };
    row('UE4 the storage writer puts ONE object, <project>/storage/v1/object/factory-releases/production/<version>/BrainFactorySetup.manifest.json (the version URL-encoded), with the platform\'s key and the manifest as the release tool writes it; it answers false for a refusal, and for no address, no key or a version that is not a version (no request is made for those three); storage not answering is the error it is',
      facts.put === true && facts.url === 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/factory-releases/production/1.2.3%2Bb.7/BrainFactorySetup.manifest.json'
        && facts.method === 'POST' && facts.auth && facts.upsert === 'true' && facts.body && facts.refused === false && facts.threw === 'error: no route' && facts.noUrl === false && facts.noKey === false
        && facts.badVersion === false && facts.requests === 3, JSON.stringify(facts));
  }

  // ================================================================= UA: the front door
  admin.storage.puts.length = 0;
  const t1 = brain.passwordToken(founder), c1 = claims(t1);
  const r1 = await authz(REL('1.0.0'), t1);
  const row1 = r1.ok ? await releaseRow(r1.release_id) : null;
  const ev1 = r1.ok ? (await sup.query(`select outcome, detail from factory.audit_events where action = 'release.published' and target_id = $1`, [r1.release_id])).rows : [];
  const v1 = r1.ok ? verifyRelease({ manifest: r1.manifest, trust: pinned, revocations: NO_REVOCATIONS }) : { ok: false };
  row('UA1 the founder with a fresh password entry: the release is published, signed by this plane\'s signer, and the installer\'s own verifier accepts the manifest with that key pinned; the record is the published production release, by the founder, and names the session and the time of the entry; one audit event says who signed and which entry authorized; the manifest is in release storage under its version',
    r1.ok === true && r1.http === 200 && r1.already !== true && r1.manifest_served === true && v1.ok === true && r1.manifest.key_id === signer.key_id
      && row1 && row1.state === 'published' && row1.channel === 'production' && row1.published_by === founder.userId && row1.authorized_session === c1.session_id
      && Number(row1.pw_epoch) === c1.amr[0].timestamp && row1.signature === r1.manifest.signature && row1.key_id === signer.key_id && JSON.stringify(row1.manifest) === JSON.stringify(r1.manifest)
      && ev1.length === 1 && ev1[0].outcome === 'ok' && ev1[0].detail.signed_by === signer.key_id && ev1[0].detail.authorized_session === c1.session_id
      && admin.storage.puts.length === 1 && admin.storage.puts[0].version === '1.0.0' && JSON.stringify(admin.storage.puts[0].manifest) === JSON.stringify(r1.manifest),
    JSON.stringify({ answer: r1.ok ? { http: r1.http, release_id: r1.release_id, manifest_served: r1.manifest_served } : r1, verify: v1.ok ? 'ok' : v1.refused, puts: admin.storage.puts.length }));

  {
    const stale = {
      ordinary_session_token: founder.token,
      three_minutes_old: brain.passwordToken(founder, { ageSeconds: 180 }),
      from_the_future: brain.passwordToken(founder, { ageSeconds: -120 }),
      another_method: brain.tokenWith(founder, { session_id: randomUUID(), amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }] }),
      no_session: brain.tokenWith(founder, { amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] }),
      malformed_session: brain.tokenWith(founder, { session_id: 'not-a-session', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] }),
    };
    const h0 = await written(), a0 = await audited('reauth_required'), p0 = admin.storage.puts.length;
    const got = {};
    for (const [name, token] of Object.entries(stale)) { const r = await authz(REL('1.5.0'), token); got[name] = r.http + ' ' + r.refused + (nodata(r) ? '' : ' +DATA'); }
    const a1 = await audited('reauth_required');
    row('UA2 without a fresh password entry the founder is refused 403 reauth_required with no data, each refusal is audited, and nothing is signed, written or placed: an ordinary session token, an entry three minutes old, an entry two minutes in the future, another sign-in method, no session, a malformed session',
      Object.values(got).every((v) => v === '403 reauth_required') && (await written()) === h0 && a1 - a0 === Object.keys(stale).length && admin.storage.puts.length === p0,
      JSON.stringify({ ...got, audited: a1 - a0 }));
  }

  const t2 = brain.passwordToken(founder, { ageSeconds: 100 });
  const r2 = await authz(REL('2.0.0'), t2);
  row('UA3 a password entry 100 seconds old is accepted (the limit is 120)', r2.ok === true && r2.already !== true, JSON.stringify({ ok: r2.ok, refused: r2.refused }));

  {
    const holding = brain.persona('holding_admin'); await W.grantAdmin(holding, 'admin');
    const holdingAsFounderTier = brain.persona('holding_admin'); await W.grantAdmin(holdingAsFounderTier, 'founder');
    const adminSelfFounder = brain.persona('employee'); await W.grantAdmin(adminSelfFounder, 'admin'); await brain.selfUpdateRole(adminSelfFounder, 'founder');
    const founderUnlisted = brain.persona('founder');
    const selfPromoted = brain.persona('employee'); await brain.selfUpdateRole(selfPromoted, 'founder');
    const hr = brain.persona('hr_finance');
    const want = { tier_admin: [holding, '403 founder_only'], holding_admin_listed_as_tier_founder: [holdingAsFounderTier, '403 founder_only'],
      listed_admin_who_made_its_own_role_founder: [adminSelfFounder, '403 founder_only'], founder_role_not_in_tenant_admins: [founderUnlisted, '403 not_authorized'],
      self_promoted_employee: [selfPromoted, '403 not_authorized'], hr_finance: [hr, '403 not_authorized'] };
    const h0 = await written(), p0 = admin.storage.puts.length;
    const got = {};
    for (const [name, [p]] of Object.entries(want)) { const r = await authz(REL('2.5.0'), brain.passwordToken(p)); got[name] = r.http + ' ' + r.refused + (nodata(r) ? '' : ' +DATA'); }
    const noToken = await authz(REL('2.5.0'), null); got.no_token = noToken.http + ' ' + noToken.refused;
    const foreign = await authz(REL('2.5.0'), brain.foreignToken(founder.userId)); got.another_projects_token = foreign.http + ' ' + foreign.refused;
    row('UA4 nobody but the founder, each WITH a fresh password entry of its own account: an admin of tier admin, a holding_admin listed as tier founder and a listed admin who made its own profiles.role founder are refused founder_only; a founder role not in tenant_admins, a self-promoted employee and hr_finance are refused not_authorized; no token and another project\'s token are not_authenticated - each with no data, and nothing is signed, written or placed',
      Object.entries(want).every(([name, [, w]]) => got[name] === w) && got.no_token === '401 not_authenticated' && got.another_projects_token === '401 not_authenticated'
        && (await written()) === h0 && admin.storage.puts.length === p0, JSON.stringify(got));
  }

  {
    const h0 = await written(), a0 = await audited('reauth_used');
    const other = await authz(REL('2.0.1'), t2);
    const sameAgain = await authz(REL('2.0.0'), t2);
    const sameNewEntry = await authz(REL('2.0.0'), brain.passwordToken(founder));
    row('UA5 one entry, one release: the entry that authorized 2.0.0 is refused reauth_used for 2.0.1 (audited); for 2.0.0 again it answers "already" with the same manifest, as a new entry does - and none of the three writes a release',
      other.http === 403 && other.refused === 'reauth_used' && nodata(other) && (await audited('reauth_used')) - a0 === 1
        && sameAgain.ok === true && sameAgain.already === true && sameAgain.release_id === r2.release_id && JSON.stringify(sameAgain.manifest) === JSON.stringify(r2.manifest)
        && sameNewEntry.ok === true && sameNewEntry.already === true && (await written()) === h0,
      JSON.stringify({ other: other.http + ' ' + other.refused, sameAgain: sameAgain.already, sameNewEntry: sameNewEntry.already }));
  }

  {
    const older = await releaseRow(r1.release_id), newer = await releaseRow(r2.release_id);
    const want2 = REL('2.0.0');
    row('UA6 exactly what was named is signed: the manifest of 2.0.0 carries the body\'s version, source, digest and receipt, the production channel and this plane\'s key id, and verifies; 2.0.0 superseded 1.0.0 (the older record says by which release), and one production release is published',
      ['version', 'source_sha', 'digest', 'receipt_sha256', 'channel'].every((k) => r2.manifest[k] === want2[k]) && r2.manifest.key_id === signer.key_id && r2.manifest.signature !== r1.manifest.signature
        && verifyRelease({ manifest: r2.manifest, trust: pinned, revocations: NO_REVOCATIONS }).ok === true
        && older.state === 'superseded' && older.superseded_by_release_id === r2.release_id && newer.state === 'published' && r2.supersedes === r1.release_id
        && (await sup.query(`select count(*)::int n from factory.releases where channel = 'production' and state = 'published'`)).rows[0].n === 1,
      JSON.stringify({ older: older.state, newer: newer.state, supersedes: r2.supersedes === r1.release_id }));
  }

  {
    const h0 = await written();
    const got = {};
    const tries = { dev_channel: REL('3.9.0', { channel: 'dev' }), no_channel: (() => { const b = REL('3.9.0'); delete b.channel; return b; })(), short_digest: REL('3.9.0', { digest: 'd'.repeat(63) }),
      upper_source: REL('3.9.0', { source_sha: 'A'.repeat(40) }), not_a_version: REL('3.9'), version_published_before: REL('2.0.0', { digest: sha256('another artifact') }),
      digest_published_before: REL('3.9.1', { digest: REL('2.0.0').digest }) };
    for (const [name, body] of Object.entries(tries)) { const r = await authz(body, brain.passwordToken(founder)); got[name] = r.http + ' ' + r.refused; }
    row('UA7 what is not an update is refused by name and nothing is written: another channel, no channel, a short digest, an upper-case source or a version that is not one are 400 bad_request; a version or a digest published before on the channel is 409 already_published',
      ['dev_channel', 'no_channel', 'short_digest', 'upper_source', 'not_a_version'].every((k) => got[k] === '400 bad_request') && got.version_published_before === '409 already_published'
        && got.digest_published_before === '409 already_published' && (await written()) === h0, JSON.stringify(got));
  }

  {
    admin.storage.ok = false;
    const down = await authz(REL('3.0.0'), brain.passwordToken(founder));
    const rowDown = down.ok ? await releaseRow(down.release_id) : null;
    admin.storage.ok = true;
    const h0 = await written(), p0 = admin.storage.puts.length;
    const again = await authz(REL('3.0.0'), brain.passwordToken(founder));
    row('UA8 release storage down: the release is published and the answer says manifest_served false; authorizing it again answers "already" with the same manifest and places it - no second signature, no second release',
      down.ok === true && down.manifest_served === false && rowDown && rowDown.state === 'published' && again.ok === true && again.already === true && again.manifest_served === true
        && again.release_id === down.release_id && JSON.stringify(again.manifest) === JSON.stringify(down.manifest) && (await written()) === h0
        && admin.storage.puts.length === p0 + 1 && admin.storage.puts.at(-1).version === '3.0.0',
      JSON.stringify({ down: down.ok ? down.manifest_served : down, again: again.ok ? { already: again.already, served: again.manifest_served } : again }));
  }

  // ================================================================= UW: the page's part
  {
    const cfg = { url: brain.url, anonKey: brain.anonKey };
    const acct = { id: founder.userId, email: founder.email };
    const whoIs = (token) => fetch(brain.url + '/auth/v1/user', { headers: { apikey: brain.anonKey, authorization: 'Bearer ' + token } }).then((r) => r.status);

    const lo0 = brain.logouts.length;
    const fresh = await passwordReauth(cfg, acct, founder.password);
    const cf = fresh.ok ? claims(fresh.token) : {};
    const live = fresh.ok ? await whoIs(fresh.token) : 0;
    const ended = fresh.ok ? await fresh.signOut() : false;
    const gone = fresh.ok ? await whoIs(fresh.token) : 0;
    row('UW1 the password check is Brain OS\'s own password sign-in for the account\'s own email: the right password opens a NEW session of that account whose token states a password entry made now; ending it says scope=local, that token is then refused by Brain OS, and the page\'s own session still answers',
      fresh.ok === true && cf.sub === founder.userId && cf.amr[0].method === 'password' && Math.abs(cf.amr[0].timestamp - Date.now() / 1000) < 30 && /^[0-9a-f-]{36}$/.test(cf.session_id)
        && fresh.token !== founder.token && live === 200 && ended === true && gone === 401 && brain.logouts.length === lo0 + 1 && brain.logouts.at(-1).scope === 'local'
        && (await whoIs(founder.token)) === 200,
      JSON.stringify({ ok: fresh.ok, live, ended, gone, scope: brain.logouts.at(-1)?.scope }));

    const g0 = brain.grants.refused;
    const wrong = await passwordReauth(cfg, acct, founder.password + 'x');
    const answers = (status, body) => ({ ...cfg, fetch: async () => new Response(JSON.stringify(body), { status }) });
    const other = await passwordReauth(answers(200, { access_token: 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc', user: { id: randomUUID() } }), acct, 'a-password');
    const silent = await passwordReauth({ ...cfg, fetch: async () => { throw new Error('down'); } }, acct, 'a-password');
    const limited = await passwordReauth(answers(429, { msg: 'rate limit' }), acct, 'a-password');
    const noSession = await passwordReauth(answers(200, { user: { id: acct.id } }), acct, 'a-password');
    row('UW2 a wrong password is refused by Brain OS (one refused sign-in) and named wrong_password; an answer for another account is not_this_account; no answer, a rate limit and an answer without a session are reauth_unavailable; no refusal carries the password',
      wrong.ok === false && wrong.refused === 'wrong_password' && brain.grants.refused === g0 + 1 && other.refused === 'not_this_account' && silent.refused === 'reauth_unavailable'
        && limited.refused === 'reauth_unavailable' && noSession.refused === 'reauth_unavailable'
        && ![wrong, other, silent, limited, noSession].some((r) => JSON.stringify(r).includes(founder.password) || JSON.stringify(r).includes('a-password')),
      JSON.stringify({ wrong: wrong.refused, other: other.refused, silent: silent.refused, limited: limited.refused, noSession: noSession.refused }));

    const P = REL('6.0.0');
    const hr = brain.persona('hr_finance');
    const mk = (over = {}) => {
      const seen = [];
      const deps = {
        account: async () => { seen.push(['account']); return acct; },
        gate: async () => { seen.push(['gate']); return admin.call('list-releases', {}, founder.token); },
        prepared: async () => { seen.push(['prepared']); return P; },
        servedDigest: async (p) => { seen.push(['servedDigest', p]); return P.digest; },
        reauth: async (a, pw) => { seen.push(['reauth', a, pw]); return passwordReauth(cfg, a, pw); },
        authorize: async (p, token) => { seen.push(['authorize', p, token]); return authz(p, token); },
        ...over,
      };
      return { deps, seen, order: () => seen.map((s) => s[0]).join('>') };
    };
    const stops = {
      no_session: [mk({ account: async () => null }), founder.password, P, 'not_authenticated', ''],
      no_password: [mk(), '', P, 'password_required', 'account'],
      not_a_factory_admin: [mk({ gate: async () => admin.call('list-releases', {}, hr.token) }), founder.password, P, 'not_authorized', 'account'],
      nothing_prepared: [mk({ prepared: async () => null }), founder.password, P, 'no_prepared_update', 'account>gate'],
      prepared_changed: [mk(), founder.password, { ...P, digest: sha256('what the page showed') }, 'update_changed', 'account>gate>prepared'],
      installer_not_served: [mk({ servedDigest: async () => null }), founder.password, P, 'installer_mismatch', 'account>gate>prepared'],
      installer_other_digest: [mk({ servedDigest: async () => sha256('another installer') }), founder.password, P, 'installer_mismatch', 'account>gate>prepared'],
      wrong_password: [mk(), founder.password + 'x', P, 'wrong_password', 'account>gate>prepared>servedDigest>reauth'],
    };
    const h0 = await written(), okGrants = brain.grants.ok;
    const got = {};
    for (const [name, [m, pw, expected, want, order]] of Object.entries(stops)) {
      const r = await authorizePreparedUpdate(m.deps, { password: pw, expected });
      got[name] = (r.ok ? 'AUTHORIZED' : r.refused) + ' [' + m.order() + ']' + (r.refused === want && m.order() === order && !m.seen.some((s) => s[0] === 'authorize') ? '' : ' UNEXPECTED');
    }
    row('UW3 one confirmation walks a fixed order - the session, the password field, the Factory\'s own gate, the prepared release, the installer as storage serves it, the password check, the Factory - and stops at the first refusal: no session, no password, not a Factory admin, nothing prepared, a release that changed since the page showed it, an installer not served or served with another digest are each refused before the password is checked; a wrong password never reaches the Factory; nothing is written',
      Object.values(got).every((v) => !v.endsWith('UNEXPECTED')) && (await written()) === h0 && brain.grants.ok === okGrants, JSON.stringify(got));

    const lo1 = brain.logouts.length;
    const full = mk();
    const done = await authorizePreparedUpdate(full.deps, { password: founder.password, expected: P });
    const usedToken = (full.seen.find((s) => s[0] === 'authorize') || [])[2];
    const rowDone = done.ok ? await releaseRow(done.release_id) : null;
    const holdingW = brain.persona('holding_admin'); await W.grantAdmin(holdingW, 'admin');
    const lo2 = brain.logouts.length;
    const P2 = REL('6.1.0');
    const notFounder = mk({ account: async () => ({ id: holdingW.userId, email: holdingW.email }), gate: async () => admin.call('list-releases', {}, holdingW.token),
      prepared: async () => P2, servedDigest: async () => P2.digest });
    const refusedByFactory = await authorizePreparedUpdate(notFounder.deps, { password: holdingW.password, expected: P2 });
    const holdingToken = (notFounder.seen.find((s) => s[0] === 'authorize') || [])[2];
    row('UW4 the founder, the right password, the prepared release as storage serves it: every step runs in order, the Factory signs and publishes exactly that release (the manifest verifies with this plane\'s key pinned), and the fresh session is ended (scope=local; its token is then refused); when the Factory refuses - an admin who is not the founder, with its own right password - the fresh session is ended as well and nothing is published',
      done.ok === true && full.order() === 'account>gate>prepared>servedDigest>reauth>authorize' && rowDone && rowDone.version === P.version && rowDone.digest === P.digest && rowDone.state === 'published'
        && verifyRelease({ manifest: done.manifest, trust: pinned, revocations: NO_REVOCATIONS }).ok === true && brain.logouts.length >= lo1 + 1 && brain.logouts[lo1].scope === 'local' && (await whoIs(usedToken)) === 401
        && refusedByFactory.ok === false && refusedByFactory.refused === 'founder_only' && brain.logouts.length === lo2 + 1 && brain.logouts.at(-1).scope === 'local' && (await whoIs(holdingToken)) === 401
        && (await sup.query(`select count(*)::int n from factory.releases where version = '6.1.0'`)).rows[0].n === 0,
      JSON.stringify({ founder: done.ok ? 'published ' + rowDone.version : done.refused, order: full.order(), not_founder: refusedByFactory.refused }));

    const pw = founder.password;
    const carried = full.seen.filter((s) => JSON.stringify(s).includes(pw)).map((s) => s[0]);
    const inDb = (await sup.query(`select (select count(*)::int from factory.audit_events a where a::text like '%' || $1 || '%') audit,
        (select count(*)::int from factory.releases r where r::text like '%' || $1 || '%') releases`, [pw])).rows[0];
    row('UW5 the password goes to the password check and nowhere else: of the six steps only that one received it; it is not in the answer, not in any response body or log event of the Admin API, not in the audit log and not in a release row',
      JSON.stringify(carried) === JSON.stringify(['reauth']) && !JSON.stringify(done).includes(pw) && !admin.bodies.join('\n').includes(pw) && !JSON.stringify(admin.events).includes(pw)
        && inDb.audit === 0 && inDb.releases === 0, JSON.stringify({ carried, inDb }));

    const made = { v: 1, channel: 'production', version: '1.2.3', source_sha: 'a'.repeat(40), digest: 'd'.repeat(64), key_id: null, receipt_sha256: 'b'.repeat(64), signature: null };
    const facts = {
      made: JSON.stringify(parsePrepared(made)) === JSON.stringify({ channel: 'production', version: '1.2.3', source_sha: made.source_sha, digest: made.digest, receipt_sha256: made.receipt_sha256 }),
      signed: parsePrepared({ ...made, key_id: signer.key_id, signature: 'A'.repeat(86) }), dev: parsePrepared({ ...made, channel: 'dev' }), v2: parsePrepared({ ...made, v: 2 }),
      badDigest: parsePrepared({ ...made, digest: 'D'.repeat(64) }), badVersion: parsePrepared({ ...made, version: '1.2' }), list: parsePrepared([made]), text: parsePrepared('{}'), none: parsePrepared(null),
    };
    row('UW6 a prepared update is the release tool\'s unsigned production manifest (make): it is read as its five values; a manifest that carries a key id or a signature, another channel, another manifest version, a malformed digest or version, a list, a text or nothing is not a prepared update',
      facts.made === true && Object.entries(facts).every(([k, v]) => k === 'made' || v === null), JSON.stringify({ ...facts, made: facts.made }));
  }

  {
    const seed = (await sup.query(`select decrypted_secret s from vault.decrypted_secrets where name = 'factory_release_signer_seed'`)).rows[0].s;
    await sup.query(`update vault.secrets set secret = encode(convert_to($1, 'utf8'), 'base64') where name = 'factory_release_signer_seed'`, ['11'.repeat(32)]);
    const h0 = await written(), p0 = admin.storage.puts.length;
    const r = await authz(REL('4.0.0'), brain.passwordToken(founder));
    await sup.query(`update vault.secrets set secret = encode(convert_to($1, 'utf8'), 'base64') where name = 'factory_release_signer_seed'`, [seed]);
    row('UA9 a stored seed that is not this plane\'s key: 503 signer_unavailable with no data, and nothing is signed, published or placed',
      r.http === 503 && r.refused === 'signer_unavailable' && nodata(r) && (await written()) === h0 && admin.storage.puts.length === p0, JSON.stringify({ answer: r.http + ' ' + r.refused }));
  }

  {
    const revoke = await admin.call('revoke-key', { key_id: signer.key_id, reason: 'UA10' }, founder.token);
    const h0 = await written(), p0 = admin.storage.puts.length;
    const r = await authz(REL('5.0.0'), brain.passwordToken(founder));
    row('UA10 the signer\'s key revoked (the certified founder-only revoke-key): authorizing an update is 409 key_revoked, and nothing is signed, published or placed',
      revoke.ok === true && r.http === 409 && r.refused === 'key_revoked' && nodata(r) && (await written()) === h0 && admin.storage.puts.length === p0,
      JSON.stringify({ revoke: revoke.ok, answer: r.http + ' ' + r.refused }));
  }
} catch (e) {
  row('UA0 the suite completed', false, (e.stack || e.message || String(e)).split('\n').slice(0, 4).join(' | '));
} finally {
  await W.stop();
}

const failed = results.filter((r) => !r.ok);
const ev = process.argv.indexOf('--evidence');
if (ev > -1) writeFileSync(process.argv[ev + 1], JSON.stringify({ suite: 'update_authorization_acceptance', results }, null, 2) + '\n');
console.log('\nupdate_authorization_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length || results.length < 20 ? 1 : 0);
