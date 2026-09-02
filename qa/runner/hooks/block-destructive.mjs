#!/usr/bin/env node
// PreToolUse hook: a REAL technical barrier for the unattended QA Director.
//
// CLAUDE.md #22 records the incident this exists for: an overnight subagent applied a migration
// to production despite being told not to, because the instruction lived only in its prompt.
// "Do not run db push" as prose is not enforcement. This hook inspects the actual command string
// the harness is about to execute and refuses it, whatever the prompt said.
//
// SCOPE, stated honestly:
//  - This guards against an autonomous agent's MISTAKE. It is not an adversarial sandbox. An
//    agent determined to evade it could (e.g. base64 a command, write a script and run it).
//    The real containment for that is credential scoping, which is a founder decision.
//  - It fails OPEN on internal error, and logs loudly when it does. Failing closed would wedge
//    every Bash call in the node the first time an unexpected payload shape arrived, which
//    would silently stop QA - a worse and much less visible outcome than one unguarded command.
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'guard.log');
const log = (m) => { try { appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch {} };

const allow = () => process.exit(0);
const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
};

// Rules are [name, test, why]. Order matters only for which reason gets reported first.
const RULES = [
  ['PRODUCTION_DB_MIGRATION',
    (c) => /supabase\s+db\s+push/i.test(c) || /supabase\s+migration\s+(up|repair)/i.test(c)
        || /supabase\s+db\s+(reset|remote\s+commit)/i.test(c),
    'Applying a database migration to production is a founder-authorised action and is blocked for the '
    + 'unattended QA node (CLAUDE.md #22 - this exact thing happened once via an overnight agent). '
    + 'Prepare the migration file and record it as a founder gate in the bug/handoff instead.'],

  ['DEPLOY_PRODUCT',
    (c) => /supabase\s+functions\s+deploy/i.test(c) || /\bvercel\s+(deploy|promote|rollback|alias|--prod)/i.test(c),
    'QA does not deploy the product. The Work PC verifies builds; the Home PC ships them. '
    + 'Deploying from the QA node would destroy the independence of the acceptance evidence.'],

  ['PUSH_TO_PRODUCT_BRANCH',
    (c) => /git\s+push[^\n;|&]*\b(master|main)\b/i.test(c) && !/qa\/work-pc/i.test(c),
    'The QA node may only push QA artefacts to the qa/work-pc branch. Pushing to master/main would '
    + 'put QA-authored changes into the product line.'],

  ['FORCE_PUSH',
    (c) => /git\s+push[^\n;|&]*(--force\b|--force-with-lease\b|\s-f\b)/i.test(c),
    'Force-pushing would rewrite shared QA history and destroy evidence. History rewrites are '
    + 'explicitly excluded by the founder instruction covering the branch-ownership reconciliation.'],

  ['DESTRUCTIVE_SQL_OUTSIDE_TRANSACTION',
    (c) => /(psql|supabase\s+db|supabase\s+sql)/i.test(c)
        && /\b(drop\s+(table|schema|database|policy|function|type)|truncate\b|delete\s+from|alter\s+table)/i.test(c)
        && !/\brollback\b/i.test(c),
    'Destructive SQL against the live database without a rollback in the same statement. QA runs '
    + 'schema/data probes inside begin; ... rollback; - if this is genuinely meant to persist, it is '
    + 'a founder-gated change, not an autonomous one.'],
];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const input = payload.tool_input || {};
    const cmd = String(input.command ?? input.script ?? '');
    if (!cmd) allow();

    for (const [name, test, why] of RULES) {
      let hit = false;
      try { hit = test(cmd); } catch (e) { log('RULE_ERROR ' + name + ' ' + e.message); }
      if (hit) {
        log('DENY ' + name + ' :: ' + cmd.slice(0, 400));
        deny('BLOCKED BY WORK-PC QA GUARD [' + name + ']: ' + why);
      }
    }
    allow();
  } catch (e) {
    log('FAIL_OPEN ' + e.message + ' :: ' + raw.slice(0, 300));
    allow();
  }
});
