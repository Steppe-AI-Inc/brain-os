# The two findings of candidate #2, reproduced before any fix (implementer; information only)

The verifier's own evidence for C2-P1 and C2-S1 was not in the implementer's hands. Each finding was reproduced from the founder's
statement of it, on candidate #2's product code, before any fix was written. These files are the outputs of those runs.

| file | what ran | what it shows |
|---|---|---|
| `c2p1_runtime_units_on_candidate2_worker.txt` | `qa/factory/v1/runtime_units.mjs` with the new rows HF1–HF8, on a working tree whose product code was candidate #2's (HEAD `baf4e4b5`) | HF1, HF2, HF3, HF5 and HF7 fail: after a transient checkpoint refusal the worker sends `complete` with status `failed`, reason `handler_error`. HF4, HF6 and HF8 pass: the terminal-credential and verification paths were already right |
| `c2p1_runtime_recovery_on_candidate2_worker.txt` | `qa/factory/v1/runtime_recovery_acceptance.mjs` with the new rows TR1 and TR2, same tree | TR1 and TR2 fail: on a real plane the run and its work order end `failed`, and no node takes the work over |
| `c2s1_edge_db_module_of_candidate2.txt` | `c2s1_repro.mjs.txt` (the script is beside it), against candidate #2's `_shared/db.ts` and postgres.js 3.4.9 | nine URL forms are accepted by `dbRefusal` while the driver, handed the same URL, reads the production project as its target |
| `c2s1_migration_tool_of_candidate2.txt` | `c2s1_migration_tool_probe.mjs.txt`, against candidate #2's `scripts/factory-control-plane/migration.mjs` and pg's own parser | the same class in the developer migration tool: ten forms accepted that pg reads as a refused project |

Nothing connected to any database outside this PC, and no file of candidate #2 was changed: the runs read its code as committed.
The committed form of "the row fails without the fix" is the mutation proof: HFT and HFTr plant candidate #2's behaviour in the
worker, DTW / DTWs hand the URL to the driver again, DTE removes the refusal on the read target, and MTT returns the migration tool
to its text-only check (`../v1_mutation/`).
