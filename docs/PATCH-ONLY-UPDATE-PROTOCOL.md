# Patch-Only Update Protocol

Use this protocol so the AI does not recreate the whole system and burn credits.

## Rule

Every update must name the module and allowed files.

## Good prompt

```text
Modify only the Proposal Factory module.
Allowed files:
- js/modules/proposalFactory.js
- js/modules/qaLab.js if tests are needed
- docs/VERSION-NOTES.md

Do not touch:
- auth
- RLS
- productionCore
- dataService
- global layout
- unrelated modules

Return changed files only.
Add QA test notes.
```

## Bad prompt

```text
Rebuild SEM Brain and add this feature.
```

## Required output from every AI developer

1. Files changed
2. Reason for each change
3. QA checks performed
4. Token impact
5. Migration needed: yes/no
6. Rollback plan

## Versioning

- UI patch: `0.7.x`
- Database migration: new migration file
- Backend function update: function version note
- Major production pilot: `0.8` or `1.0`
