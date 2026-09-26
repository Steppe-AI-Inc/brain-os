// THE PLATFORM PATH (a whole-request gate; found 2026-09-27 before any deploy, by reading the path shape rather than a harness run).
// Supabase's Edge runtime hands a function its requests with the function's own name as the first path segment: a node calling
// https://<project>.supabase.co/functions/v1/factory-node-api/v1/time reaches the function as /factory-node-api/v1/time. The local
// harness served the handlers at the root, so every suite passed while every deployed call would have been a 404.
//
// Each entry point passes its own name (basePath); the portable handlers match their S-7 routes after exactly that one prefix. A
// path without the prefix is taken as the same route, because whether the platform strips it is measured at the founder's deploy,
// never assumed. The route surface is unchanged - exactly S-7 - and a doubled, foreign or partial prefix is still 404.
export function routePath(pathname: string, basePath = ''): string {
  return basePath && pathname.startsWith(basePath + '/') ? pathname.slice(basePath.length) : pathname;
}
