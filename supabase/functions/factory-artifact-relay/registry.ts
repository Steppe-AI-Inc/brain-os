// THE NODES THIS FUNCTION AUTHENTICATES. The installer writes this file from the founder's registration (relay/install.mjs);
// no node and no request can change it. As committed it is empty: a function deployed without a registration authenticates nobody.
export type RegisteredNode = { node_id: string; relay_role: "sender" | "verifier"; public_key: string };

export const REGISTRY: RegisteredNode[] = [];
