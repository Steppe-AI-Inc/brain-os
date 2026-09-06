// Preload: define the ONE free identifier the belt reads, as an EMPTY Set.
// If a suite's output changes when this exists, that suite was silently hitting
// ReferenceError inside readsAsCompletion and treating the throw as a verdict.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();
