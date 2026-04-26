export interface AdminIdentity {
  userId: string;
  email: string | null;
}

function parseCsvEnv(value: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!value) return out;
  for (const part of value.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return out;
}

const _adminUserIds = parseCsvEnv(process.env.ADMIN_USER_IDS);
const _adminEmails = parseCsvEnv(process.env.ADMIN_EMAILS);

if (_adminUserIds.size === 0 && _adminEmails.size === 0) {
  console.warn(
    "[admin] WARNING: No ADMIN_USER_IDS or ADMIN_EMAILS configured. All admin routes will deny access."
  );
}

export function isAdmin(identity: AdminIdentity): boolean {
  if (_adminUserIds.has(identity.userId.toLowerCase())) return true;
  if (identity.email && _adminEmails.has(identity.email.toLowerCase())) return true;
  return false;
}
