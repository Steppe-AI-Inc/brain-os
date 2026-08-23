# Manual Test Checklist

## Local fallback test

- [ ] Open index.html.
- [ ] Dashboard loads.
- [ ] Founder Command creates tasks in fallback mode.
- [ ] Token event is logged.
- [ ] Tasks page shows generated tasks.
- [ ] Approval Center shows approval-required tasks.

## Access test

- [ ] Switch to Employee user.
- [ ] Companies page hides parent ownership/cash fields.
- [ ] People page hides other employees' salary.
- [ ] My Work shows only assigned tasks/KPIs.

## Token test

- [ ] Token Control estimates a command.
- [ ] Hard-stop budget blocks oversized command.
- [ ] Module Registry creates patch-only prompt.

## Real AI backend test

- [ ] Deploy to Vercel/Netlify/Supabase.
- [ ] Set OPENAI_API_KEY in backend environment.
- [ ] Real AI Backend test endpoint returns JSON.
- [ ] Founder command uses real_ai_backend source.
- [ ] Generated tasks have acceptance criteria and approval gates.
