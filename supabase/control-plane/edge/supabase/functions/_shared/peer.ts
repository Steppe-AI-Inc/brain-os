// THE CONNECTING PEER (S-6: "the connecting peer address as the Edge platform sees it, never a client-supplied header"). Portable
// (erasable-only TypeScript): Deno serves it (factory-node-api/index.ts), and the developer suites run the same file under Node 24.
//
// peerOf(info) reads ONLY info.remoteAddr.hostname - the address the runtime reports for the accepted connection - and never a request
// header. It applies one syntax rule, whatever the value: a dotted-quad IPv4 address, or an IPv6 address without a zone (an
// IPv4-mapped IPv6 address is read as its IPv4 address; brackets are removed). Anything else - no info at all, a transport without a
// hostname (a unix socket), a name, an address the rule does not accept - is no usable peer: '' . The Node API then still records the
// enrollment request, as peer_unavailable (503), and serves every other route unchanged (node_api.ts; part 150).
// It compares the address with no range (loopback, private, a platform's): the per-address limit keys on whatever the platform reports.
import type { Peer } from './node_api.ts';

const IPV4 = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

/** the canonical text of an IP address, or '' when the value is not one (see the header) */
export function canonicalAddress(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return '';
  let h = value;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const mapped = /^::ffff:([0-9.]+)$/i.exec(h);
  if (mapped) h = mapped[1];
  if (IPV4.test(h)) return h;
  if (!h.includes(':') || !/^[0-9A-Fa-f:.]+$/.test(h)) return '';   // IPv6 characters only: no zone (%), no name, no port
  // the WHATWG URL parser is the IPv6 syntax rule (and gives the canonical, compressed, lower-case form); asked first, so nothing throws
  const url = 'http://[' + h + ']/';
  if (!URL.canParse(url)) return '';
  const c = new URL(url).hostname.slice(1, -1);
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(c);   // the URL form of an IPv4-mapped address
  if (m) { const a = parseInt(m[1], 16), b = parseInt(m[2], 16); return [a >> 8, a & 255, b >> 8, b & 255].join('.'); }
  return c;
}

/** the peer of a request, from what the runtime handed the handler (Deno.ServeHandlerInfo): never a header */
export function peerOf(info: unknown): Peer {
  const addr = info && typeof info === 'object' ? (info as { remoteAddr?: unknown }).remoteAddr : undefined;
  const hostname = addr && typeof addr === 'object' ? (addr as { hostname?: unknown }).hostname : undefined;
  return { address: canonicalAddress(hostname) };
}

/** a (Request, ServeHandlerInfo) handler around a Node API handler: the one place the peer is derived */
export const withPeer = (h: (req: Request, peer: Peer) => Promise<Response>) =>
  (req: Request, info?: unknown): Promise<Response> => h(req, peerOf(info));
