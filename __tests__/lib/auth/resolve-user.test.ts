import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@/lib/firebase/admin', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}));

import { resolveUser } from '@/lib/auth/resolve-user';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';

// Typed mock helpers
const mockVerifyToken = vi.mocked(verifyToken);
const mockCreateServiceClient = vi.mocked(createServiceClient);

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-uuid-1',
  role: 'member',
  active_organization_id: 'org-uuid-1',
  active_team_id: 'team-uuid-1',
};

const MOCK_TEAM_MEMBERSHIPS = [
  { team_id: 'team-uuid-1', role: 'owner' as const },
  { team_id: 'team-uuid-2', role: 'member' as const },
];

const MOCK_ORG_MEMBERSHIPS = [
  { organization_id: 'org-uuid-1', role: 'org_admin' as const },
  { organization_id: 'org-uuid-2', role: 'member' as const },
];

// ---------------------------------------------------------------------------
// Helper: build a mock Supabase client
// ---------------------------------------------------------------------------

type TeamMembershipFixture = Array<{ team_id: string; role: 'owner' | 'admin' | 'member' }>;
type OrgMembershipFixture = Array<{ organization_id: string; role: 'org_admin' | 'member' }>;

function buildMockSupabaseClient(options: {
  user?: typeof MOCK_USER | null;
  userError?: object | null;
  teamData?: TeamMembershipFixture;
  orgData?: OrgMembershipFixture;
}) {
  const {
    user = MOCK_USER,
    userError = null,
    teamData = MOCK_TEAM_MEMBERSHIPS,
    orgData = MOCK_ORG_MEMBERSHIPS,
  } = options;

  // Build a chainable query builder for the users table (.select().eq().single())
  const usersSingle = vi.fn().mockResolvedValue({ data: user, error: userError });
  const usersEq = vi.fn().mockReturnValue({ single: usersSingle });
  const usersSelect = vi.fn().mockReturnValue({ eq: usersEq });

  // Build a chainable query builder for team_members (.select().eq())
  const teamEq = vi.fn().mockResolvedValue({ data: teamData, error: null });
  const teamSelect = vi.fn().mockReturnValue({ eq: teamEq });

  // Build a chainable query builder for org_members (.select().eq())
  const orgEq = vi.fn().mockResolvedValue({ data: orgData, error: null });
  const orgSelect = vi.fn().mockReturnValue({ eq: orgEq });

  const fromMock = vi.fn((table: string) => {
    if (table === 'users') return { select: usersSelect };
    if (table === 'team_members') return { select: teamSelect };
    if (table === 'org_members') return { select: orgSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from: fromMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when authorization header is missing (verifyToken throws)', async () => {
    mockVerifyToken.mockRejectedValue(new Error('Missing or invalid authorization header'));

    await expect(resolveUser(null)).rejects.toThrow('Missing or invalid authorization header');
    expect(mockVerifyToken).toHaveBeenCalledWith(null);
  });

  it('throws when user not found in Supabase', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({ user: null, userError: { code: 'PGRST116' } });
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    await expect(resolveUser('Bearer valid-token')).rejects.toThrow('User not found');
  });

  it('returns correct UserContext with memberships for a valid token', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({});
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    expect(ctx.user).toEqual(MOCK_USER);
    expect(ctx.teamIds).toEqual(['team-uuid-1', 'team-uuid-2']);
    expect(ctx.orgIds).toEqual(['org-uuid-1', 'org-uuid-2']);
    expect(ctx.teamMemberships).toEqual(MOCK_TEAM_MEMBERSHIPS);
    expect(ctx.orgMemberships).toEqual(MOCK_ORG_MEMBERSHIPS);
  });

  it('isSystemAdmin returns true for system_admin role', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-admin' });
    const mockClient = buildMockSupabaseClient({
      user: { ...MOCK_USER, role: 'system_admin' },
    });
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer admin-token');

    expect(ctx.isSystemAdmin).toBe(true);
  });

  it('isSystemAdmin returns false for non-system_admin role', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({});
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    expect(ctx.isSystemAdmin).toBe(false);
  });

  it('isOrgAdmin returns true for org_admin in the specified org', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({});
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    // MOCK_ORG_MEMBERSHIPS has org-uuid-1 with role org_admin
    expect(ctx.isOrgAdmin('org-uuid-1')).toBe(true);
    // org-uuid-2 has role 'member', not org_admin
    expect(ctx.isOrgAdmin('org-uuid-2')).toBe(false);
    // org not in memberships
    expect(ctx.isOrgAdmin('org-uuid-unknown')).toBe(false);
  });

  it('isOrgAdmin returns true for system_admin regardless of membership', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-admin' });
    const mockClient = buildMockSupabaseClient({
      user: { ...MOCK_USER, role: 'system_admin' },
      orgData: [], // no org memberships
    });
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer admin-token');

    // system_admin should be org admin for any org
    expect(ctx.isOrgAdmin('org-uuid-1')).toBe(true);
    expect(ctx.isOrgAdmin('some-random-org')).toBe(true);
  });

  it('isTeamAdmin returns true for team owner', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({});
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    // MOCK_TEAM_MEMBERSHIPS: team-uuid-1 = owner, team-uuid-2 = member
    expect(ctx.isTeamAdmin('team-uuid-1')).toBe(true);
  });

  it('isTeamAdmin returns true for team admin', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({
      teamData: [
        { team_id: 'team-uuid-1', role: 'admin' as const },
        { team_id: 'team-uuid-2', role: 'member' as const },
      ],
    });
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    expect(ctx.isTeamAdmin('team-uuid-1')).toBe(true);
    expect(ctx.isTeamAdmin('team-uuid-2')).toBe(false);
  });

  it('isTeamAdmin returns false for team member (non-admin role)', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-1' });
    const mockClient = buildMockSupabaseClient({});
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer valid-token');

    // team-uuid-2 has role 'member'
    expect(ctx.isTeamAdmin('team-uuid-2')).toBe(false);
  });

  it('isTeamAdmin returns true for system_admin regardless of membership', async () => {
    mockVerifyToken.mockResolvedValue({ uid: 'firebase-uid-admin' });
    const mockClient = buildMockSupabaseClient({
      user: { ...MOCK_USER, role: 'system_admin' },
      teamData: [], // no team memberships
    });
    mockCreateServiceClient.mockReturnValue(mockClient as unknown as ReturnType<typeof createServiceClient>);

    const ctx = await resolveUser('Bearer admin-token');

    // system_admin should be team admin for any team
    expect(ctx.isTeamAdmin('team-uuid-1')).toBe(true);
    expect(ctx.isTeamAdmin('some-random-team')).toBe(true);
  });
});
