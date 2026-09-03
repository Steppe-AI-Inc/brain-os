import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BUG-009 (Work-PC C002): founder bookmarks and stored deep links point at /brain,
  // but Brain chat has lived at /chat since the Phase-1 rewrite (no /brain route ever
  // existed in this app) — the old links 404ed with no forwarding. Query params
  // (?channel=..., ?new=1) are preserved by Next's redirect handling, so stored
  // channel deep links land in the right conversation. Non-permanent on purpose:
  // a 308 would be cached by browsers indefinitely and this is a courtesy alias, not
  // a canonical-URL commitment.
  async redirects() {
    return [
      { source: "/brain", destination: "/chat", permanent: false },
    ];
  },
};

export default nextConfig;
