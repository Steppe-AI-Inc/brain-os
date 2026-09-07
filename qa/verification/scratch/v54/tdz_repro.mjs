
export function repro() {
  const replayLabel = 'Archived ACME Corp';
  const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN.test(replayLabel) || COMPLETION_WORD.test(replayLabel);
  const PAST_COMPLETION_CLAIM_PATTERN = /(?<!may )(?<!might )(?<!could )(?<!can )\b(has been|have been|was|were)\b[^.]{0,30}\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\b|\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\s+successfully\b|\brenamed:\s*.+(→|->)/i;
  const COMPLETION_WORD = /\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|ended|moved|added|granted|confirmed|renamed|declined|closed|done|cleared|sent)\b/i;
  return readsAsAssertion;
}
