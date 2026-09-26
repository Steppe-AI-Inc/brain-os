import { redirect } from "next/navigation";

// RETIRED by WO-8 (the implementer's statement, for Director ratification): this was a registry of self-registered machines -
// public.workers rows that existed because a machine ran register-worker.mjs on its own say-so. Brain OS -> Factory -> Computers
// replaces it: there a computer exists only because a Factory admin added it and it enrolled with a one-time pairing code, and its
// state is derived by the Factory. The route stays as a redirect so old links land on the replacement. Brain OS production gets no
// schema change from this feature (S-9): public.workers and getWorkers() are left as they are.
export default function WorkersPage() {
  redirect("/software-factory/computers");
}
