// Vercel Serverless Function: /api/google-drive-export
// Production skeleton. Real deployment should use OAuth tokens stored server-side.
// This endpoint is intentionally dry-run by default so proposal export cannot happen accidentally.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { title, content, folderId, dryRun = true } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'Missing title or content' });
    if (dryRun) return res.status(200).json({ ok: true, dryRun: true, planned: { title, folderId: folderId || null, mimeType: 'application/vnd.google-apps.document' } });
    return res.status(501).json({ error: 'Google OAuth export not implemented in static MVP. Add server-side OAuth token exchange and Docs/Drive API calls.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
