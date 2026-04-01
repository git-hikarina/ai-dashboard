import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import type { TeamMemberRole, OrgMemberRole } from '@/lib/supabase/types';

export interface UserContext {
  user: { id: string; role: string; active_organization_id: string | null; active_team_id: string | null };
  teamIds: string[];
  orgIds: string[];
  teamMemberships: Array<{ team_id: string; role: TeamMemberRole }>;
  orgMemberships: Array<{ organization_id: string; role: OrgMemberRole }>;
  isSystemAdmin: boolean;
  isOrgAdmin: (orgId: string) => boolean;
  isTeamAdmin: (teamId: string) => boolean;
}

/**
 * Resolve Firebase auth header → Supabase user + memberships.
 * Throws on auth failure (caller should catch and return 401).
 */
export async function resolveUser(authHeader: string | null): Promise<UserContext> {
  const { uid } = await verifyToken(authHeader);
  const supabase = createServiceClient();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, role, active_organization_id, active_team_id')
    .eq('firebase_uid', uid)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  const [teamResult, orgResult] = await Promise.all([
    supabase.from('team_members').select('team_id, role').eq('user_id', user.id),
    supabase.from('org_members').select('organization_id, role').eq('user_id', user.id),
  ]);

  const teamMemberships = (teamResult.data ?? []) as Array<{ team_id: string; role: TeamMemberRole }>;
  const orgMemberships = (orgResult.data ?? []) as Array<{ organization_id: string; role: OrgMemberRole }>;

  return {
    user,
    teamIds: teamMemberships.map((t) => t.team_id),
    orgIds: orgMemberships.map((o) => o.organization_id),
    teamMemberships,
    orgMemberships,
    isSystemAdmin: user.role === 'system_admin',
    isOrgAdmin: (orgId: string) =>
      user.role === 'system_admin' ||
      orgMemberships.some((o) => o.organization_id === orgId && o.role === 'org_admin'),
    isTeamAdmin: (teamId: string) =>
      user.role === 'system_admin' ||
      teamMemberships.some((t) => t.team_id === teamId && (t.role === 'owner' || t.role === 'admin')),
  };
}
