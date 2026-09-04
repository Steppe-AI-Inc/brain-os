const FUTURE_PROMISE_PATTERN = /\b(i['’]?ll|i will|i['’]?m going to|going to)\b[^.]{0,40}\b(assign|creat(e|ing)|archiv(e|ing)|restor(e|ing)|updat(e|ing)|delet(e|ing)|mov(e|ing)|reassign(ing)?|end(ing)?|set(ting)?|remov(e|ing))\b/i;
        const claimsFutureActionWithNoPlan = model !== 'deterministic-confirmation' && model !== 'deterministic-plan-execution' && model !== 'deterministic-clarification' && model !== 'deterministic-disambiguation'
          && !result.pendingAction && !groundedOutcomeThisTurn
          && FUTURE_PROMISE_PATTERN.test(String(result.summary || ''));
        if (claimsFutureActionWithNoPlan) {
          result.summary = 'I described an action but didn’t actually queue or execute it — nothing happened yet. Please ask again and I’ll either do it immediately or ask for confirmation first.';
        }

        const summaryIsFullyDeterministic = !!organizationGraphCheck || !!proposedPlan
          || model === 'deterministic-plan-execution' || lifecycleReports.length > 0
          || stateClaimCorrections.length > 0 || lifecycleMismatchCorrections.length > 0
          || claimsFutureActionWithNoPlan;
        const deterministicPrefix = summaryIsFullyDeterministic
          ? String(result.summary || '')
          : (factLines.length > 0 ? factLines.join(' ') : '');

        const PAST_COMPLETION_CLAIM_PATTERN = /(?<!may )(?<!might )(?<!could )(?<!can )\b(has been|have been|was|were)\b[^.]{0,30}\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\b|\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\s+successfully\b|\brenamed:\s*.+(→|->)/i;

        const evidenceIndex = new Map();
        for (const e of claimExecutionEvidence) {
          if (!e.postconditionPassed) continue;
          const key = e.resourceType + '|' + e.id;
          if (!evidenceIndex.has(key)) evidenceIndex.set(key, new Set());
          evidenceIndex.get(key).add(e.action);
        }

        const canonicalById = new Map();
        for (const [bucket, type] of [['companies', 'company'], ['people', 'person'], ['projects', 'project'], ['tasks', 'task'], ['goals', 'goal'], ['approvals', 'approval'], ['departments', 'department']]) {
          for (const row of (contextPack || {})[bucket] || []) {
            if (row && typeof row.id === 'string') canonicalById.set(type + '|' + row.id, row);
          }
        }

        const DEBUG_RESOURCE_IDS = Deno.env.get('SEM_AI_DEBUG_RESOURCE_IDS') === '1';
        const TYPED_FALLBACK = {
          company: 'the company', person: 'the person', project: 'the project', task: 'the task',
          goal: 'the goal', approval: 'the approval', department: 'the department',
          business_unit: 'the business unit', work_order: 'the work order', agent: 'the agent',
          channel: 'the channel', lead: 'the lead', document: 'the document',
          product_line: 'the product line', product_spec: 'the software spec', drawing: 'the drawing',
          ai_provider: 'the AI provider', mcp_connector: 'the MCP connector', proposal: 'the proposal',
          company_relationship: 'the company relationship', person_assignment: 'the assignment',
          memory: 'the memory entry',
        };
        const lastKnownLabel = (resourceType, id) => {
          const created = runtimeLabels.get(resourceType + '|' + id);
          if (typeof created === 'string' && created.length > 0) return created;
          const fromMap = resourceType === 'company' ? companyNameById.get(id)
            : resourceType === 'task' ? taskTitleById.get(id)
            : resourceType === 'person' ? personNameById.get(id)
            : resourceType === 'goal' ? goalTitleById.get(id)
            : null;
          return typeof fromMap === 'string' && fromMap.length > 0 ? fromMap : null;
        };
        const safeDisplayLabel = (raw) => {
          if (typeof raw !== 'string') return null;
          let label = raw.trim();
          if (label.length === 0) return null;
          if (UUID_IN_TEXT.test(label)) return null;
          if (label.length > 80) label = label.slice(0, 77) + '…';
          if (PAST_COMPLETION_CLAIM_PATTERN.test(label) || COMPLETION_WORD.test(label)) {
            if (PAST_COMPLETION_CLAIM_PATTERN.test(label) && /(\band\b|,|;)/i.test(label)) return null;
            return `“${label}”`;
          }
          return label;
        };
        const displayName = (resourceType, id) => {
          const row = canonicalById.get(resourceType + '|' + id);
          const canonical = row && (row.name || row.title || row.full_name);
          const label = safeDisplayLabel(typeof canonical === 'string' && canonical.length > 0 ? canonical : null)
            || safeDisplayLabel(lastKnownLabel(resourceType, id));
          if (label) return DEBUG_RESOURCE_IDS ? `${label} (${id})` : label;
          const typed = TYPED_FALLBACK[resourceType]
            || (typeof resourceType === 'string' && /^[a-z][a-z_]{0,29}$/.test(resourceType) ? `the ${resourceType.replace(/_/g, ' ')}` : 'the record');
          return DEBUG_RESOURCE_IDS ? `${typed} (${id})` : typed;
        };

        const UUID_IN_TEXT = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
        const ACTION_PAST = {
          create: 'created', delete: 'deleted', update: 'updated', archive: 'archived',
          restore: 'restored', activate: 'activated', deactivate: 'deactivated',
          assign: 'assigned', reassign: 'reassigned',
          permanent_delete: 'permanently deleted', end_employment: 'removed from active employment',
          restore_employment: 'restored to active employment',
        };
        const safeActionPast = (action) => ACTION_PAST[String(action)] || 'changed';
        const safePredicate = (p) =>
          typeof p === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(p) ? p : null;
        const safeValueText = (v) => {
          const s = String(v);
          if (UUID_IN_TEXT.test(s)) return 'the referenced record';
          return s.length > 120 ? s.slice(0, 117) + '…' : s;
        };
        const safeProseFragment = (s) => {
          if (typeof s !== 'string') return null;
          const t = s.trim();
          if (t.length === 0) return null;
          if (UUID_IN_TEXT.test(t)) return null;
          if (PAST_COMPLETION_CLAIM_PATTERN.test(t)) return null;
          return t;
        };
        const FUTURE_PROMISE_IN_QUESTION = /\b(i['’]?ll|i will|i['’]?m going to|going to)\b[^.]{0,40}\b(assign|creat(e|ing)|archiv(e|ing)|restor(e|ing)|updat(e|ing)|delet(e|ing)|mov(e|ing)|reassign(ing)?|end(ing)?|set(ting)?|remov(e|ing))\b/i;
        const safeQuestionFragment = (s) => {
          if (typeof s !== 'string') return null;
          const t = s.trim();
          if (t.length === 0) return null;
          if (UUID_IN_TEXT.test(t)) return null;
          if (!t.includes('?')) return null; // the question channel carries questions
          const lastQ = t.lastIndexOf('?');
          const head = t.slice(0, lastQ);
          const KNOWN_ABBREVIATION = /^(inc|ltd|co|corp|llc|plc|gmbh|dr|mr|mrs|ms|jr|sr|st|no|nr|vs|etc|approx|dept|div)$/i;
          let cut = -1;
          for (let k = head.length - 1; k >= 0; k--) {
            const ch = head[k];
            if (ch === '!' || ch === '?' || ch === ';' || ch === ':' || ch === '…' || ch === '。' || ch === '！' || ch === '？' || ch === '—' || ch === '\n') { cut = k; break; }
            if (ch === '.') {
              const beforeWordMatch = head.slice(0, k).match(/([A-Za-z0-9.]+)$/);
              const beforeWord = beforeWordMatch ? beforeWordMatch[1].replace(/\.+$/, '') : '';
              const next = head[k + 1] === ' ' ? head[k + 2] : head[k + 1];
              const decimal = /[0-9]$/.test(beforeWord) && next !== undefined && /[0-9]/.test(next);
              const abbreviation = /^[A-Za-z]$/.test(beforeWord) || KNOWN_ABBREVIATION.test(beforeWord);
              if (decimal || abbreviation) continue;
              cut = k; break;
            }
          }
          let q = t.slice(cut + 1).replace(/^[\s*_>#•-]+/, '').trim();
          if (q.includes(',')) {
            const clauses = q.split(',');
            const tail = clauses[clauses.length - 1].trim();
            const head = clauses.slice(0, -1).join(',');
            if (tail.length > 0 && (COMPLETION_WORD.test(head) || PAST_COMPLETION_CLAIM_PATTERN.test(head))) q = tail;
          }
          if (q.length === 0 || q.length > 200) return null;
          if (FUTURE_PROMISE_IN_QUESTION.test(q)) return null;
          if (PAST_COMPLETION_CLAIM_PATTERN.test(q)) return null;
          const INTERROGATIVE_LEAD = /^(please\s+)?(who|whom|whose|which|what|when|where|why|how|do|does|did|is|are|was|were|am|can|could|should|shall|will|would|may|might|have|has|had|if)\b/i;
          const FIRST_PERSON_MAIN_CLAUSE_COMPLETION = /(?<!\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\s\w{1,24}\s)\b(i|we)\s+(?:\w+ly\s+|just\s+|already\s+|have\s+|has\s+|had\s+){0,2}(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\b/i;
          if (FIRST_PERSON_MAIN_CLAUSE_COMPLETION.test(q)) return null;
          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;
          return q;
        };
        const COMPLETION_WORD = /\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|ended|moved|added|granted|confirmed|renamed|declined|closed|done|cleared|sent)\b/i;
        const safeOptionLabel = (s) => {
          let t = safeProseFragment(s);
          if (t === null) return null;
          t = t.replace(/[.!?\s]+$/, '').trim();
          if (t.length === 0) return null;
          if (t.length > 80) t = t.slice(0, 77) + '…';
          if (PAST_COMPLETION_CLAIM_PATTERN.test(t)) return null;
          if (COMPLETION_WORD.test(t)) {
            const NAME_CONNECTOR = /^(of|to|in|at|on|by|for|and|or|the|a|an|de|von|van|&)$/i;
            const QUOTE_CODES = [34, 39, 8220, 8216];
            const words = t.split(/\s+/).map((w) => (QUOTE_CODES.includes(w.charCodeAt(0)) ? w.slice(1) : w));
            const titleCasedName = words.every((w) => /^[\p{Lu}0-9(&[-]/u.test(w) || NAME_CONNECTOR.test(w));
            if (!titleCasedName) return null;
            const completionIdx = words.findIndex((w) => COMPLETION_WORD.test(w));
            if (completionIdx > 0) return null;
            const ADJECTIVAL_COMPLETION = /^(closed|completed|restored)$/i;
            if (completionIdx === 0 && !ADJECTIVAL_COMPLETION.test(words[0])) return null;
            const DETERMINER_OR_PRONOUN = /^(the|a|an|all|any|every|each|both|its|his|her|their|our|your|my|this|that|these|those|everything|everyone|anyone|nothing|it|them|us|me|him|files?|data)$/i;
            if (completionIdx === 0 && words.length > 1
                && (/^[\p{Lu}0-9]{2,}$/u.test(words[1]) || DETERMINER_OR_PRONOUN.test(words[1]))) return null;
          }
          return t;
        };
        const safePendingSummary = (s) => {
          const t = safeProseFragment(s);
          if (t === null) return null;
          if (t.length > 200) return null;
          const IMPERATIVE_LEAD = /^(archive|restore|create|delete|update|assign|reassign|mark|set|move|end|add|remove|rename|close|clear|send|grant|decline|approve|reject|complete|activate|deactivate|make|change)\b/i;
          if (!IMPERATIVE_LEAD.test(t)) {
            const headClause = t.split(/[—;,.\n]/)[0].trim();
            if (/\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined|done)$/i.test(headClause)) return null;
            let tail = t;
            const CLOSER_CODES = [34, 39, 8221, 8217, 41, 93, 46, 33, 32];
            while (tail.length > 0 && CLOSER_CODES.includes(tail.charCodeAt(tail.length - 1))) tail = tail.slice(0, -1);
            if (/\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined|done)$/i.test(tail)) return null;
          }
          return t;
        };

        const rawClaims = Array.isArray(result.claims) ? result.claims : null;
        const verifiedClaims = [];
        const rejectedClaims = [];

        function verifyStructuredClaim(claim) {
          const type = typeof claim.type === 'string' ? claim.type : '';
          const resourceType = typeof claim.resourceType === 'string' ? claim.resourceType : '';
          const resourceId = typeof claim.resourceId === 'string' ? claim.resourceId : null;
          const action = typeof claim.action === 'string' ? claim.action : null;
          const key = resourceType + '|' + resourceId;

          if (type === 'mutation_result' || type === 'assignment') {
            if (!resourceId) return { verdict: 'unsupported', reason: 'mutation claim carries no canonical resource id' };
            if (!action) return { verdict: 'unsupported', reason: 'mutation claim carries no action to verify' };
            const actions = evidenceIndex.get(key);
            if (!actions) return { verdict: 'unsupported', reason: 'no execution evidence for ' + resourceType + ' ' + resourceId + ' this turn' };
            if (!actions.has(action)) return { verdict: 'unsupported', reason: 'executed ' + [...actions].join('/') + ' on this resource, not ' + action };
            return { verdict: 'supported', reason: 'backend execution evidence with confirmed postcondition' };
          }

          if (type === 'current_state' || type === 'approval_state' || type === 'existence' || type === 'count') {
            if (!resourceId) return { verdict: 'unknown', reason: 'state claim carries no canonical resource id' };
            const row = canonicalById.get(key);
            if (!row) return { verdict: 'unknown', reason: 'resource not present in this turn’s canonical read' };
            if (evidenceIndex.has(key)) {
              return { verdict: 'unknown', reason: 'this turn mutated ' + resourceType + ' ' + resourceId + '; the canonical read predates that change and cannot settle its current state' };
            }
            const predicate = typeof claim.predicate === 'string' ? claim.predicate : null;
            if (!predicate) return { verdict: 'supported', reason: 'resource exists in the canonical read' };
            if (!Object.prototype.hasOwnProperty.call(row, predicate)) return { verdict: 'unknown', reason: 'predicate not present in the canonical read' };
            const actual = row[predicate];
            if (claim.expectedValue === undefined) return { verdict: 'unknown', reason: 'no expected value supplied for predicate ' + predicate };
            if (String(actual) === String(claim.expectedValue)) return { verdict: 'supported', reason: predicate + '=' + String(actual) + ' in the canonical read' };
            return { verdict: 'contradicted', reason: predicate + ' is ' + String(actual) + ', not ' + String(claim.expectedValue) };
          }

          if (type === 'historical_event') {
            return { verdict: 'unknown', reason: 'no indexed audit trail for prior-turn events (see issue #5 A/C/D/E, still open)' };
          }

          if (type === 'verification_state') return { verdict: 'supported', reason: 'informational verification state' };
          return { verdict: 'unknown', reason: 'unrecognised claim type: ' + (type || '(none)') };
        }

        if (rawClaims) {
          for (const claim of rawClaims) {
            if (!claim || typeof claim !== 'object') continue;
            const outcome = verifyStructuredClaim(claim);
            const row = { claim, verdict: outcome.verdict, reason: outcome.reason };
            if (outcome.verdict === 'supported') verifiedClaims.push(row);
            else if (outcome.verdict === 'unsupported' || outcome.verdict === 'contradicted') rejectedClaims.push(row);
            else verifiedClaims.push(row);
          }
        }

        const envelopeQuestions = (Array.isArray(result.questions) ? result.questions : [])
          .map(safeQuestionFragment).filter((q) => q !== null);
        const envelopeProposedActions = (Array.isArray(result.proposedActions) ? result.proposedActions : [])
          .map(safeProseFragment).filter((a) => a !== null);

        let pendingActionGatingChanged = false;
        if (result.pendingAction && typeof result.pendingAction === 'object') {
          const paObj = result.pendingAction;
          const beforeSummary = paObj.summary ?? null, beforeQuestion = paObj.question ?? null;
          paObj.summary = safePendingSummary(paObj.summary);
          paObj.question = safeQuestionFragment(paObj.question);
          if (paObj.summary !== beforeSummary || paObj.question !== beforeQuestion) pendingActionGatingChanged = true;
          if (Array.isArray(paObj.options)) {
            const unresolvableOptionIndexes = [];
            const CANONICAL_TYPE_ALIAS = {
              employee: 'person', staff: 'person', user: 'person', member: 'person', contact: 'person',
              organization: 'company', organisation: 'company', org: 'company', business: 'company',
              client: 'company', customer: 'company', vendor: 'company', supplier: 'company', partner: 'company',
              subsidiary: 'company', ticket: 'task', todo: 'task', objective: 'goal', okr: 'goal',
            };
            for (let oi = 0; oi < paObj.options.length; oi++) {
              const o = paObj.options[oi];
              if (!o || typeof o !== 'object') continue;
              const beforeLabel = o.label;
              const derivedLabel = typeof o.id === 'string' && o.id
                ? displayName(CANONICAL_TYPE_ALIAS[typeof o.entityType === 'string' ? o.entityType : ''] || (typeof o.entityType === 'string' ? o.entityType : 'record'), o.id)
                : `option ${oi + 1}`;
              const canonicalType = CANONICAL_TYPE_ALIAS[typeof o.entityType === 'string' ? o.entityType : '']
                || (typeof o.entityType === 'string' ? o.entityType : 'record');
              const safeLabel = safeOptionLabel(o.label);
              const bare = (v) => String(v).replace(/[“”‘’"']/g, '').trim().toLowerCase();
              const canonicalKnowsIt = !!derivedLabel
                && typeof o.id === 'string' && o.id.length > 0
                && (canonicalById.has(canonicalType + '|' + o.id) || lastKnownLabel(canonicalType, o.id) !== null);
              const agrees = !!safeLabel && bare(safeLabel) === bare(derivedLabel);
              o.label = agrees ? safeLabel : derivedLabel;
              if (o.label !== beforeLabel) pendingActionGatingChanged = true;
              if (!canonicalKnowsIt) unresolvableOptionIndexes.push(oi);
            }
            if (unresolvableOptionIndexes.length > 0) {
              paObj.options = paObj.options.filter((_, oi) => !unresolvableOptionIndexes.includes(oi));
              pendingActionGatingChanged = true;
            }
            const labelKey = (s) => s.replace(/[“”‘’"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
              .replace(/\s*\(option \d+\)$/, '');
            const labelCounts = new Map();
            for (const o of paObj.options) {
              if (o && typeof o.label === 'string') labelCounts.set(labelKey(o.label), (labelCounts.get(labelKey(o.label)) || 0) + 1);
            }
            for (let oi = 0; oi < paObj.options.length; oi++) {
              const o = paObj.options[oi];
              if (o && typeof o.label === 'string' && labelCounts.get(labelKey(o.label)) > 1) {
                o.label = `${o.label.replace(/\s*\(option \d+\)$/, '')} (option ${oi + 1})`;
                pendingActionGatingChanged = true;
              }
            }
          }
        }
        if ((Array.isArray(result.questions) ? result.questions.length : 0) !== envelopeQuestions.length
          || (Array.isArray(result.proposedActions) ? result.proposedActions.length : 0) !== envelopeProposedActions.length
          || envelopeQuestions.some((q, qi) => q !== (result.questions || [])[qi])) {
          pendingActionGatingChanged = true;
        }
        result.questions = envelopeQuestions;
        result.proposedActions = envelopeProposedActions;

        const hasRejectedClaims = rejectedClaims.length > 0;

        const LEGACY_PAST_COMPLETION = /(?<!may )(?<!might )(?<!could )(?<!can )\b(has been|have been|was|were)\b[^.]{0,30}\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\b|\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\s+successfully\b|\brenamed:\s*.+(→|->)/i;

        const PROGRESS_VERBS = 'assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending';
        const EXECUTION_IN_PROGRESS = new RegExp(
          '\\b(' +
          'executing (?:the )?(?:plan|request|action|changes?)' +
          '|working on (?:' + PROGRESS_VERBS + ')' +
          '|processing (?:the |your )?(?:plan|request|action|changes?)' +
          '|i(?:\'|’)?m (?:now |currently |just )?(?:' + PROGRESS_VERBS + ')' +
          '|i am (?:now |currently |just )?(?:' + PROGRESS_VERBS + ')' +
          '|(?:now|currently) (?:' + PROGRESS_VERBS + ')' +
          '|(?:is|are|was|were) (?:being |getting )?(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)' +
          '|^(?:' + PROGRESS_VERBS + ') ' +
          '|(?:about to|going to|proceeding to|starting to) (?:archive|restore|delete|remove|assign|reassign|update|create|move|end|rename|close|clear|grant|decline|approve|reject|complete|activate|deactivate|add|send)' +
          '|in the process of (?:' + PROGRESS_VERBS + ')' +
          '|(?:going ahead and|kicking off) (?:the )?(?:' + PROGRESS_VERBS + '|archive|restore|delete)' +
          '|starting the (?:' + PROGRESS_VERBS + '|archive|restore|delete)' +
          '|let me (?:archive|restore|delete|remove|assign|reassign|update|create|move|end|rename|close|clear|grant|decline|approve|reject|complete|activate|deactivate)' +
          ')\\b', 'i');
        const hasSupportedMutationClaim = verifiedClaims.some((v) => v.verdict === 'supported'
          && (v.claim.type === 'mutation_result' || v.claim.type === 'assignment'));
        const CONFIRMED_COMPLETION = /^\s*confirmed\s*[—–-]\s*[^]*?(?<!\bthe )(?<!\ba )(?<!\ban )(?<!\bany )(?<!\byour )(?<!\bmy )(?<!\bour )(?<!\d )\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\b/i;
        const NEGATED_CLAUSE = /\b(?:not|never|no|nothing|none|pending|awaiting|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|hasn['’]?t|haven['’]?t|didn['’]?t|don['’]?t|cannot|can['’]?t)\b/i;
        const REFERENCELESS_CONFIRMATION = /^\s*confirmed\s*[—–-]\s*the\s+[a-z]+(\s+[a-z]+)?(\s*\(option\s+\d+\))?\s*[.!]?\s*$/i;
        const COMPLETION_PARTICIPLE = /\b(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added)\b/i;
        const COMPLETION_VERB = /\b(?:has|have|had|was|were)(?:\s+(?:not|been|being|already|just|recently|successfully|also|now))*\s+(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added)\b|\b(?:archived|deleted|updated|created|restored|removed|completed|renamed|approved|rejected|assigned|reassigned|moved|sent|cleared|granted|declined|ended|activated|deactivated)\s+successfully\b/i;
        const completionIsNegated = (c) => {
          const n = c.search(NEGATED_CLAUSE);
          if (n < 0) return false;
          const m = COMPLETION_VERB.exec(c);
          if (m === null) return true;
          const rel = m[0].search(COMPLETION_PARTICIPLE);
          return n <= m.index + (rel < 0 ? 0 : rel);
        };
        const readsAsCompletion = (s) => REFERENCELESS_CONFIRMATION.test(s)
          || (CONFIRMED_COMPLETION.test(String(s)) && !completionIsNegated(String(s).split(/[.!?,\x3b\n]/)[0]))
          || String(s).split(/[.!?,\x3b\n]+|:\s/).map((c) => c.trim()).some((c) => !completionIsNegated(c)
            && (LEGACY_PAST_COMPLETION.test(c) || EXECUTION_IN_PROGRESS.test(c)));
        const legacyProseFallback = !hasSupportedMutationClaim
          && model !== 'deterministic-confirmation' && model !== 'deterministic-plan-execution' && model !== 'deterministic-clarification' && model !== 'deterministic-disambiguation'
          && !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan
          && readsAsCompletion(String(result.summary || ''));

        const hasMutationShapedClaim = rawClaims
          ? rawClaims.some((c) => c && typeof c === 'object' && (c.type === 'mutation_result' || c.type === 'assignment'))
          : false;
        const hasConfirmedMutationEvidenceInWindow = claimExecutionEvidence.some((e) => e.postconditionPassed);
        const unaccountedCompletionProse = !hasSupportedMutationClaim
          && readsAsCompletion(String(result.summary || ''));
        const structuredProseDrift = unaccountedCompletionProse
          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);
        const rewriteFromStructure = hasRejectedClaims || hasMutationShapedClaim || hasConfirmedMutationEvidenceInWindow || structuredProseDrift;
        const claimsPastCompletionWithNoGrounding = rewriteFromStructure || legacyProseFallback;

        if (rewriteFromStructure) {
          const supportedLines = verifiedClaims
            .filter((v) => v.verdict === 'supported')
            .map((v) => {
              const c = v.claim;
              const subject = displayName(c.resourceType, c.resourceId);
              if (c.type === 'mutation_result' || c.type === 'assignment') return `${subject}: ${safeActionPast(c.action)} — confirmed.`;
              const predicate = safePredicate(c.predicate);
              if (predicate) return `${subject}: ${predicate} is ${safeValueText(c.expectedValue)}.`;
              return `${subject}: confirmed.`;
            });
          const rejectedLines = rejectedClaims.filter((r) => {
            const c = r.claim;
            if ((c.type === 'mutation_result' || c.type === 'assignment') && !c.resourceId && typeof c.action === 'string') {
              return !claimExecutionEvidence.some((e) => e.postconditionPassed && e.resourceType === c.resourceType && e.action === c.action);
            }
            return true;
          }).map((r) => {
            const c = r.claim;
            const subject = displayName(c.resourceType, c.resourceId);
            if (r.verdict === 'contradicted') {
              const predicate = safePredicate(c.predicate);
              const canonicalRow = canonicalById.get(c.resourceType + '|' + c.resourceId);
              const actual = canonicalRow && predicate && Object.prototype.hasOwnProperty.call(canonicalRow, predicate) ? canonicalRow[predicate] : undefined;
              return predicate && actual !== undefined
                ? `Actually, ${subject}’s ${predicate} is ${safeValueText(actual)} in the current records.`
                : `Actually, the records show otherwise for ${subject}.`;
            }
            return c.action
              ? `I can’t confirm from this turn’s execution record that ${subject} was ${safeActionPast(c.action)}.`
              : `I can’t confirm that claim about ${subject} from this turn’s execution record.`;
          });
          const claimedEvidenceKeys = new Set(verifiedClaims
            .filter((v) => v.verdict === 'supported' && (v.claim.type === 'mutation_result' || v.claim.type === 'assignment'))
            .map((v) => v.claim.resourceType + '|' + v.claim.resourceId + '|' + v.claim.action));
          const unclaimedLines = [];
          const unclaimedTypes = [];
          const seenUnclaimed = new Set();
          for (const e of claimExecutionEvidence) {
            if (!e.postconditionPassed) continue;
            if (e.action !== 'create' && e.action !== 'update' && e.action !== 'activate' && e.action !== 'deactivate') continue;
            const k = e.resourceType + '|' + e.id + '|' + e.action;
            if (claimedEvidenceKeys.has(k) || seenUnclaimed.has(k)) continue;
            seenUnclaimed.add(k);
            unclaimedLines.push(`${displayName(e.resourceType, String(e.id))}: ${safeActionPast(e.action)}.`);
            unclaimedTypes.push(e.resourceType);
          }

          const pa = result.pendingAction;
          const pendingPrompt = pa && typeof pa === 'object'
            ? [pa.question, pa.summary].map(safeProseFragment).find((v) => v !== null) || ''
            : '';
          const rawOptions = pa && typeof pa === 'object' && Array.isArray(pa.options) ? pa.options : [];
          const paOptions = rawOptions.map((o) => safeProseFragment(o && o.label)).filter((l) => l !== null);
          const promptWithOptions = paOptions.length > 0
            ? `${pendingPrompt}${pendingPrompt ? ' ' : ''}Options: ${paOptions.join(' | ')}.`
            : pendingPrompt;

          const RESTATED_BY_LIFECYCLE_REPORT = new Set(['work_order', 'person_assignment']);
          const unclaimedNotRestated = summaryIsFullyDeterministic
            ? unclaimedLines.filter((_, i) => !RESTATED_BY_LIFECYCLE_REPORT.has(unclaimedTypes[i]))
            : unclaimedLines;
          const claimParts = summaryIsFullyDeterministic
            ? [deterministicPrefix, ...unclaimedNotRestated, ...rejectedLines, ...envelopeQuestions, promptWithOptions]
            : [deterministicPrefix, ...supportedLines, ...unclaimedLines, ...rejectedLines, ...envelopeQuestions, promptWithOptions];
          result.summary = claimParts.filter((p) => p && String(p).trim().length > 0).join(' ').trim();
          if (result.summary.length === 0) {
            result.summary = 'I can’t confirm the completion my draft described from this turn’s execution record — nothing verifiable was changed. Please ask again or use the relevant page in the app.';
          }
        } else if (legacyProseFallback) {
          const paLegacy = result.pendingAction;
          const legacyPrompt = paLegacy && typeof paLegacy === 'object'
            ? [paLegacy.question, paLegacy.summary].map((v) => (typeof v === 'string' ? v.trim() : '')).find((v) => v.length > 0) || ''
            : '';
          result.summary = ['I can’t actually do that from chat — nothing was changed. Please use the relevant page in the app for this action, or rephrase using an action I can execute.', legacyPrompt]
            .filter((p) => p.length > 0).join(' ');
        }