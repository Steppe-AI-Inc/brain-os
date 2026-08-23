// Vercel Serverless Function: /api/slack-action
// Production skeleton. Store SLACK_BOT_TOKEN only in backend environment variables.
// Required for posting: Slack bot token with appropriate chat:write scope and channel access.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { channel, text, dryRun = true } = req.body || {};
    if (!channel || !text) return res.status(400).json({ error: 'Missing channel or text' });
    if (dryRun) return res.status(200).json({ ok: true, dryRun: true, channel, text });
    if (!process.env.SLACK_BOT_TOKEN) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text })
    });
    const json = await slackRes.json();
    if (!json.ok) return res.status(502).json({ error: json.error || 'Slack API error', details: json });
    return res.status(200).json({ ok: true, slack: json });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
