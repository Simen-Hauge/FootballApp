// Simple admin gate driven by the ADMIN_EMAILS env var (comma-separated).
// Must be used after requireAuth. The list is matched case-insensitively
// against the authenticated user's email.

function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(req, res, next) {
  if (!req.user?.email) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const admins = getAdminEmails();
  if (!admins.includes(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAdmin, getAdminEmails };
