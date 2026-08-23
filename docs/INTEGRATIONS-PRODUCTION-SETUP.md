# Slack + Google Drive Production Setup Notes

## Slack

- Use Slack OAuth install flow.
- Store bot token server-side only.
- Outbound Slack messages must be approval-gated unless purely internal digest.
- Suggested first use cases:
  - Daily digest to #management
  - Approval alerts to #sales
  - Missing update reminders to team channels
  - Blocker capture from Slack messages into SEM Brain tasks

## Google Drive / Docs

- Use least-permission OAuth scopes.
- Export only approved proposals/quotations/specs.
- Suggested Drive folder structure:
  - /SEM Brain/Proposals
  - /SEM Brain/Quotations
  - /SEM Brain/Product Specs
  - /SEM Brain/Contracts Pending Approval
  - /SEM Brain/Meeting Notes

## Security

- Never put Slack/Google tokens in browser code.
- Every export/post should create an audit log.
- External proposals, customer messages, contracts and price changes require human approval.
