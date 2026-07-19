// Shared between the import UI and the /api/import-* server routes.
//
// Cloudflare Workers free plan allows max 50 subrequests per request, and
// each imported parent costs several Supabase calls — so imports are sent in
// small chunks.
export const MAX_PARENTS_PER_REQUEST = 10;
