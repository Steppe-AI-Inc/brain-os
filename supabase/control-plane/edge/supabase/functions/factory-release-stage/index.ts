// factory-release-stage: the prepared update, staged by the Factory (founder correction 2026-10-03; CR-028; _shared/release_stage.ts).
// Called by the Director, with its own tooling (WO-6 r4: no implementer-authored program receives or invokes its key), after a
// candidate is CERTIFIED, with a statement of the prepared update signed by the Director's signing key. No caller is trusted for
// anything else: what is staged is exactly what that signature covers, and only the request that first stages a statement receives
// its installer's upload address (S-7). Deploying it is a founder action (ALLOW_FUNCTIONS_DEPLOY=1?), with the project's other functions.
// Lives in the control-plane Supabase CLI project (supabase/control-plane/edge/supabase/), never supabase/functions/.
//
// Configuration: none is set by the founder. The platform gives every function of the project:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   this project's own address and storage key. Their ONE use here: reading and writing the
//                                   prepared update (production/prepared.json, production/prepared.sig) in the public release storage,
//                                   and asking it for the installer's one-object upload address. Without them nothing is staged (503).
import { ed25519SelfTest } from '../_shared/node_api.ts';
import { createStageApi, DIRECTOR_KEY, storageReader, storageUploadSigner, storageWriter } from '../_shared/release_stage.ts';

const storage = {
  url: Deno.env.get('SUPABASE_URL') || '', key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
};

Deno.serve(createStageApi({
  directorKey: DIRECTOR_KEY,
  read: storageReader(storage),
  put: storageWriter(storage),
  signUpload: storageUploadSigner(storage),
  selfTest: ed25519SelfTest,
}));
