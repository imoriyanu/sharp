// Sharp AI. Auth middleware for /api/v2 endpoints.
// Verifies the Supabase access token from `Authorization: Bearer <jwt>` and
// attaches a trusted `req.userId`. The agent's retrieval tools use the service
// role key (which bypasses RLS), so this header is the security boundary , 
// never trust req.body.userId for queries.
//
// Failure modes are intentionally soft: a missing / invalid JWT sets
// `req.userId = null` and lets the request continue. The v2 endpoint sees
// the null and falls back to the deterministic v1 prompt, so users never
// see a broken thread because of an auth hiccup.

function makeVerifyUser(supabase) {
  return async function verifyUser(req, res, next) {
    req.userId = null;
    try {
      const header = req.headers.authorization || '';
      if (!header.toLowerCase().startsWith('bearer ')) return next();
      const token = header.slice(7).trim();
      if (!token || !supabase) return next();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user?.id) return next();
      req.userId = data.user.id;
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = { makeVerifyUser };
