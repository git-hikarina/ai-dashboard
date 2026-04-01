# Phase 2: Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cost control, presets, auto-routing, admin dashboard, and Slack notifications to the AI Dashboard.

**Architecture:** Vertical slice approach — each task delivers a complete feature (DB → API → UI). A shared auth helper resolves user context with memberships. The cost estimation engine and auto-router are pure functions tested independently, then integrated into the chat API.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL), Firebase Auth, Vercel AI SDK v6, Zustand, shadcn/ui (v4), Tailwind CSS v4, recharts, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-phase2-intelligence-design.md`

---

## File Structure

### New files

```
supabase/migrations/002_phase2_schema.sql          # New tables + columns
src/lib/auth/resolve-user.ts                        # Shared: resolve Firebase UID → user + memberships
src/lib/ai/router.ts                                # Auto-routing: tier detection + model selection
src/lib/ai/token-estimator.ts                       # Token count estimation from text
src/lib/ai/cost-estimator.ts                        # Cost estimation (tokens × pricing)
src/lib/slack/notify.ts                             # Slack Incoming Webhook notifications
src/app/api/presets/route.ts                        # GET (list) + POST (create)
src/app/api/presets/[id]/route.ts                   # GET + PATCH + DELETE
src/app/api/presets/[id]/toggle/route.ts            # POST (toggle user preference)
src/app/api/estimate/route.ts                       # POST (cost estimate)
src/app/api/admin/pricing/route.ts                  # GET (list all)
src/app/api/admin/pricing/[id]/route.ts             # PATCH (update price)
src/app/api/admin/usage/route.ts                    # GET (summary)
src/app/api/admin/usage/daily/route.ts              # GET (daily breakdown)
src/app/api/admin/approval/[id]/route.ts            # PATCH (approve/reject)
src/app/admin/layout.tsx                            # Admin layout + permission guard
src/app/admin/page.tsx                              # Admin index → redirect to /admin/usage
src/app/admin/usage/page.tsx                        # Usage dashboard (recharts)
src/app/admin/pricing/page.tsx                      # Model pricing editor
src/components/chat/preset-selector.tsx             # Preset dropdown in chat header
src/components/chat/cost-display.tsx                # Inline cost estimate display
src/components/chat/cost-confirm-dialog.tsx         # Confirmation dialog for ¥500+
src/components/admin/usage-summary-cards.tsx         # Summary cards (total cost, budget, etc.)
src/components/admin/usage-daily-chart.tsx           # Daily cost chart (recharts)
src/components/admin/usage-by-user-table.tsx         # User breakdown table
src/components/admin/usage-by-model-table.tsx        # Model breakdown table
src/components/admin/pricing-table.tsx               # Editable pricing table
__tests__/lib/ai/router.test.ts                     # Router tests
__tests__/lib/ai/token-estimator.test.ts            # Token estimator tests
__tests__/lib/ai/cost-estimator.test.ts             # Cost estimator tests
__tests__/lib/slack/notify.test.ts                  # Slack notification tests
__tests__/lib/auth/resolve-user.test.ts             # Auth helper tests
```

### Modified files

```
src/lib/supabase/types.ts                           # Add preset + budget types
src/stores/chat-store.ts                            # Add presetId to ChatTab
src/app/api/chat/route.ts                           # Integrate routing, cost check, budget alert
src/app/chat/[id]/page.tsx                          # Add PresetSelector, CostDisplay
src/components/chat/chat-input.tsx                  # Add cost display slot
src/components/chat/model-selector.tsx              # Add "自動" option
```

---

## Task 1: DB Migration + Type Definitions

**Files:**
- Create: `supabase/migrations/002_phase2_schema.sql`
- Modify: `src/lib/supabase/types.ts`
- Test: `__tests__/lib/supabase/types.test.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/002_phase2_schema.sql`:

```sql
-- =============================================================================
-- 002_phase2_schema.sql
-- Phase 2: Intelligence — Presets, Budget, Approval
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRESETS (custom instruction sets)
-- ---------------------------------------------------------------------------
CREATE TABLE presets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  system_prompt   text        NOT NULL,
  recommended_model text,
  icon            text,
  scope           text        NOT NULL,
  owner_id        uuid        REFERENCES users(id) ON DELETE CASCADE,
  team_id         uuid        REFERENCES teams(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT presets_scope_check CHECK (scope IN ('personal', 'team', 'organization')),
  CONSTRAINT presets_scope_owner CHECK (
    (scope = 'personal' AND owner_id IS NOT NULL) OR
    (scope = 'team' AND team_id IS NOT NULL) OR
    (scope = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE INDEX idx_presets_owner_id ON presets (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_presets_team_id ON presets (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_presets_organization_id ON presets (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_presets_scope ON presets (scope);

ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_presets_updated_at
  BEFORE UPDATE ON presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- USER PRESET PREFERENCES
-- ---------------------------------------------------------------------------
CREATE TABLE user_preset_preferences (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_id  uuid        NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  is_enabled boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_preset_preferences_unique UNIQUE (user_id, preset_id)
);

CREATE INDEX idx_user_preset_preferences_user_id ON user_preset_preferences (user_id);

ALTER TABLE user_preset_preferences ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- FK: sessions.preset_id → presets
-- ---------------------------------------------------------------------------
ALTER TABLE sessions
  ADD CONSTRAINT sessions_preset_id_fkey
  FOREIGN KEY (preset_id) REFERENCES presets(id) ON DELETE SET NULL;

CREATE INDEX idx_sessions_preset_id ON sessions (preset_id) WHERE preset_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Organizations: budget columns
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN monthly_budget_jpy numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN budget_alert_sent_80 boolean NOT NULL DEFAULT false,
  ADD COLUMN budget_alert_sent_100 boolean NOT NULL DEFAULT false,
  ADD COLUMN budget_alert_month text;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_monthly_budget_non_negative CHECK (monthly_budget_jpy >= 0);

-- ---------------------------------------------------------------------------
-- Usage logs: add pending status
-- ---------------------------------------------------------------------------
ALTER TABLE usage_logs
  DROP CONSTRAINT usage_logs_approval_status_check;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_approval_status_check
  CHECK (approval_status IN ('auto', 'pending', 'user_approved', 'admin_approved', 'rejected'));
```

- [ ] **Step 2: Run the migration on Supabase**

Open Supabase Dashboard → SQL Editor → paste and run `002_phase2_schema.sql`.
Or via CLI: `npx supabase db push` (if Supabase CLI is configured).

Verify: check that `presets`, `user_preset_preferences` tables exist, and `organizations` has the new columns.

- [ ] **Step 3: Update type definitions**

Add the following types to `src/lib/supabase/types.ts`:

After the `ApprovalStatus` type, add `'pending'`:
```typescript
export type ApprovalStatus =
  | "auto"
  | "pending"
  | "user_approved"
  | "admin_approved"
  | "rejected";
```

Add `PresetScope` type:
```typescript
/** Preset scope levels */
export type PresetScope = "personal" | "team" | "organization";
```

Add row type:
```typescript
/** Presets (custom instruction sets) */
export interface DbPreset {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  recommended_model: string | null;
  icon: string | null;
  scope: PresetScope;
  owner_id: string | null;
  team_id: string | null;
  organization_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** User preset preferences */
export interface DbUserPresetPreference {
  id: string;
  user_id: string;
  preset_id: string;
  is_enabled: boolean;
  created_at: string;
}
```

Add to `DbOrganization`:
```typescript
monthly_budget_jpy: number;
budget_alert_sent_80: boolean;
budget_alert_sent_100: boolean;
budget_alert_month: string | null;
```

Add insert/update types:
```typescript
export type DbPresetInsert = Omit<DbPreset, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbPreset, "id">>;

export type DbPresetUpdate = Partial<Omit<DbPreset, "id" | "created_at">>;

export type DbUserPresetPreferenceInsert = Omit<
  DbUserPresetPreference,
  "id" | "created_at"
> & Partial<Pick<DbUserPresetPreference, "id">>;
```

- [ ] **Step 4: Update existing type tests**

In `__tests__/lib/supabase/types.test.ts`, add a test to verify the new types compile correctly (type-level test). If the file only has compile-time checks, ensure the new types are imported.

- [ ] **Step 5: Run tests**

```bash
cd ai-dashboard && npx vitest run
```

Expected: All existing tests pass, new type imports resolve.

- [ ] **Step 6: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/002_phase2_schema.sql src/lib/supabase/types.ts __tests__/lib/supabase/types.test.ts
git commit -m "feat(phase2): add presets table, budget columns, and type definitions"
```

---

## Task 2: User Context Helper

A shared function to resolve Firebase UID → Supabase user + team/org memberships. Used by presets API, admin API, and cost estimation.

**Files:**
- Create: `src/lib/auth/resolve-user.ts`
- Create: `__tests__/lib/auth/resolve-user.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/auth/resolve-user.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the pure logic of resolveUser by mocking Supabase
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  verifyToken: vi.fn(),
}));

import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/firebase/admin';

function mockSupabaseChain(data: unknown, error: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
          // For non-single queries
          then: undefined,
        }),
        // For queries that return arrays
        in: vi.fn().mockResolvedValue({ data: data, error }),
      }),
    }),
  };
}

describe('resolveUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if authorization header is missing', async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error('Missing authorization header'));
    await expect(resolveUser(null)).rejects.toThrow('Missing authorization header');
  });

  it('returns user with memberships for valid token', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ uid: 'firebase-123', email: 'test@example.com' });

    const mockUser = { id: 'user-1', role: 'member', active_organization_id: null, active_team_id: null };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockUser, error: null }),
              }),
            }),
          };
        }
        if (table === 'team_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ team_id: 'team-1', role: 'admin' }], error: null }),
            }),
          };
        }
        if (table === 'org_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ organization_id: 'org-1', role: 'member' }], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      }),
    };

    vi.mocked(createServiceClient).mockReturnValue(supabase as any);

    const result = await resolveUser('Bearer fake-token');
    expect(result.user.id).toBe('user-1');
    expect(result.teamIds).toContain('team-1');
    expect(result.orgIds).toContain('org-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/auth/resolve-user.test.ts
```

Expected: FAIL — `resolveUser` module not found.

- [ ] **Step 3: Implement resolveUser**

Create `src/lib/auth/resolve-user.ts`:

```typescript
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbUser, UserRole, TeamMemberRole, OrgMemberRole } from '@/lib/supabase/types';

export interface UserContext {
  user: Pick<DbUser, 'id' | 'role' | 'active_organization_id' | 'active_team_id'>;
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

  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, role, active_organization_id, active_team_id')
    .eq('firebase_uid', uid)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  // Get memberships in parallel
  const [teamResult, orgResult] = await Promise.all([
    supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id),
    supabase
      .from('org_members')
      .select('organization_id, role')
      .eq('user_id', user.id),
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
```

- [ ] **Step 4: Run tests**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/auth/resolve-user.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/resolve-user.ts __tests__/lib/auth/resolve-user.test.ts
git commit -m "feat(phase2): add resolveUser helper for auth + membership context"
```

---

## Task 3: Presets CRUD API

**Files:**
- Create: `src/app/api/presets/route.ts`
- Create: `src/app/api/presets/[id]/route.ts`
- Create: `src/app/api/presets/[id]/toggle/route.ts`

- [ ] **Step 1: Implement GET + POST /api/presets**

Create `src/app/api/presets/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbPresetInsert } from '@/lib/supabase/types';

// GET /api/presets — List presets available to the authenticated user
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    // Build OR conditions for scope-based access
    let query = supabase
      .from('presets')
      .select('*, user_preset_preferences!left(is_enabled)')
      .eq('is_active', true)
      .order('scope')
      .order('name');

    // Use RPC or raw filter for complex OR conditions
    const { data, error } = await supabase
      .from('presets')
      .select('*')
      .eq('is_active', true)
      .or(
        `and(scope.eq.personal,owner_id.eq.${ctx.user.id}),` +
        (ctx.teamIds.length > 0
          ? `and(scope.eq.team,team_id.in.(${ctx.teamIds.join(',')}))`
          : 'and(scope.eq.team,team_id.is.null)') + ',' +
        (ctx.orgIds.length > 0
          ? `and(scope.eq.organization,organization_id.in.(${ctx.orgIds.join(',')}))`
          : 'and(scope.eq.organization,organization_id.is.null)')
      )
      .order('scope')
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch user preferences for these presets
    const presetIds = (data ?? []).map((p) => p.id);
    const { data: prefs } = presetIds.length > 0
      ? await supabase
          .from('user_preset_preferences')
          .select('preset_id, is_enabled')
          .eq('user_id', ctx.user.id)
          .in('preset_id', presetIds)
      : { data: [] };

    const prefMap = new Map((prefs ?? []).map((p) => [p.preset_id, p.is_enabled]));

    const result = (data ?? []).map((preset) => ({
      ...preset,
      is_enabled_by_user: prefMap.get(preset.id) ?? false,
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/presets — Create a new preset
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const body = await request.json() as {
      name: string;
      description?: string;
      system_prompt: string;
      recommended_model?: string;
      icon?: string;
      scope: 'personal' | 'team' | 'organization';
      team_id?: string;
      organization_id?: string;
    };

    if (!body.name || !body.system_prompt || !body.scope) {
      return NextResponse.json(
        { error: 'name, system_prompt, and scope are required' },
        { status: 400 },
      );
    }

    // Permission check
    if (body.scope === 'team') {
      if (!body.team_id || !ctx.isTeamAdmin(body.team_id)) {
        return NextResponse.json({ error: 'Forbidden: team admin required' }, { status: 403 });
      }
    } else if (body.scope === 'organization') {
      if (!body.organization_id || !ctx.isOrgAdmin(body.organization_id)) {
        return NextResponse.json({ error: 'Forbidden: org admin required' }, { status: 403 });
      }
    }

    const insert: DbPresetInsert = {
      name: body.name,
      description: body.description ?? null,
      system_prompt: body.system_prompt,
      recommended_model: body.recommended_model ?? null,
      icon: body.icon ?? null,
      scope: body.scope,
      owner_id: body.scope === 'personal' ? ctx.user.id : null,
      team_id: body.scope === 'team' ? body.team_id! : null,
      organization_id: body.scope === 'organization' ? body.organization_id! : null,
      is_active: true,
    };

    const { data: preset, error } = await supabase
      .from('presets')
      .insert(insert)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-enable for the creator
    await supabase.from('user_preset_preferences').insert({
      user_id: ctx.user.id,
      preset_id: preset.id,
      is_enabled: true,
    });

    return NextResponse.json(preset, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 2: Implement GET/PATCH/DELETE /api/presets/[id]**

Create `src/app/api/presets/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/presets/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const { data: preset, error } = await supabase
      .from('presets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PATCH /api/presets/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    // Fetch existing preset
    const { data: existing } = await supabase
      .from('presets')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Permission check
    const canEdit =
      (existing.scope === 'personal' && existing.owner_id === ctx.user.id) ||
      (existing.scope === 'team' && existing.team_id && ctx.isTeamAdmin(existing.team_id)) ||
      (existing.scope === 'organization' && existing.organization_id && ctx.isOrgAdmin(existing.organization_id)) ||
      ctx.isSystemAdmin;

    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as {
      name?: string;
      description?: string;
      system_prompt?: string;
      recommended_model?: string | null;
      icon?: string | null;
      is_active?: boolean;
    };

    const { data: updated, error } = await supabase
      .from('presets')
      .update({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.system_prompt !== undefined && { system_prompt: body.system_prompt }),
        ...(body.recommended_model !== undefined && { recommended_model: body.recommended_model }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.is_active !== undefined && { is_active: body.is_active }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/presets/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from('presets')
      .select('scope, owner_id, team_id, organization_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    const canDelete =
      (existing.scope === 'personal' && existing.owner_id === ctx.user.id) ||
      (existing.scope === 'team' && existing.team_id && ctx.isTeamAdmin(existing.team_id)) ||
      (existing.scope === 'organization' && existing.organization_id && ctx.isOrgAdmin(existing.organization_id)) ||
      ctx.isSystemAdmin;

    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('presets').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 3: Implement POST /api/presets/[id]/toggle**

Create `src/app/api/presets/[id]/toggle/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/presets/[id]/toggle — Toggle user's enabled state for a preset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: presetId } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));
    const supabase = createServiceClient();

    // Check preset exists
    const { data: preset } = await supabase
      .from('presets')
      .select('id')
      .eq('id', presetId)
      .single();

    if (!preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Check existing preference
    const { data: existing } = await supabase
      .from('user_preset_preferences')
      .select('id, is_enabled')
      .eq('user_id', ctx.user.id)
      .eq('preset_id', presetId)
      .single();

    if (existing) {
      // Toggle
      const { data: updated, error } = await supabase
        .from('user_preset_preferences')
        .update({ is_enabled: !existing.is_enabled })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(updated);
    } else {
      // Create with enabled=true
      const { data: created, error } = await supabase
        .from('user_preset_preferences')
        .insert({
          user_id: ctx.user.id,
          preset_id: presetId,
          is_enabled: true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(created, { status: 201 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 4: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/presets/
git commit -m "feat(phase2): add presets CRUD API endpoints"
```

---

## Task 4: Auto-routing Engine

Pure functions with no external dependencies — easy to test.

**Files:**
- Create: `src/lib/ai/token-estimator.ts`
- Create: `src/lib/ai/router.ts`
- Create: `__tests__/lib/ai/token-estimator.test.ts`
- Create: `__tests__/lib/ai/router.test.ts`

- [ ] **Step 1: Write token estimator tests**

Create `__tests__/lib/ai/token-estimator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '@/lib/ai/token-estimator';

describe('estimateTokens', () => {
  it('estimates Japanese text at ~1.5 tokens per character', () => {
    const text = 'こんにちは世界'; // 7 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThanOrEqual(9);  // 7 * 1.5 ≈ 10.5
    expect(tokens).toBeLessThanOrEqual(12);
  });

  it('estimates English text at ~1.3 tokens per word', () => {
    const text = 'Hello world this is a test'; // 6 words
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThanOrEqual(7);
    expect(tokens).toBeLessThanOrEqual(10);
  });

  it('handles mixed Japanese and English', () => {
    const text = 'Hello こんにちは world';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/token-estimator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement token estimator**

Create `src/lib/ai/token-estimator.ts`:

```typescript
// Japanese character range (CJK Unified Ideographs + Hiragana + Katakana)
const CJK_REGEX = /[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu;

/**
 * Estimate token count from text using character/word heuristics.
 * Japanese: ~1.5 tokens per character
 * English/other: ~1.3 tokens per word
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count CJK characters
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches?.length ?? 0;
  const cjkTokens = Math.ceil(cjkCount * 1.5);

  // Remove CJK characters to count remaining as words
  const nonCjk = text.replace(CJK_REGEX, ' ').trim();
  const words = nonCjk ? nonCjk.split(/\s+/).filter(Boolean) : [];
  const wordTokens = Math.ceil(words.length * 1.3);

  return cjkTokens + wordTokens;
}

/**
 * Estimate tokens for an entire conversation (array of message contents).
 */
export function estimateConversationTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}
```

- [ ] **Step 4: Run token estimator tests**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/token-estimator.test.ts
```

Expected: PASS

- [ ] **Step 5: Write router tests**

Create `__tests__/lib/ai/router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectTier, selectModelForTier } from '@/lib/ai/router';
import { MODELS, type ModelInfo } from '@/lib/ai/models';

describe('detectTier', () => {
  it('detects light tier for short text', () => {
    expect(detectTier('こんにちは')).toBe('light');
  });

  it('detects standard for code blocks', () => {
    expect(detectTier('このコードを直して\n```\nconst x = 1;\n```')).toBe('standard');
  });

  it('detects light for translation keywords', () => {
    expect(detectTier('この文章を英語に翻訳して')).toBe('light');
  });

  it('detects standard for analysis keywords', () => {
    expect(detectTier('このデータを分析してレポートを作成してください。詳細に比較して、各項目について評価してください。')).toBe('standard');
  });

  it('detects heavy for long text', () => {
    const longText = 'あ'.repeat(2500); // ~3750 tokens
    expect(detectTier(longText)).toBe('heavy');
  });
});

describe('selectModelForTier', () => {
  const availableModels = MODELS.filter((m) =>
    ['google', 'deepseek'].includes(m.provider),
  );

  it('selects cheapest model in light tier', () => {
    const model = selectModelForTier('light', availableModels);
    expect(model).toBeDefined();
    expect(model!.tier).toBe('light');
  });

  it('falls back to adjacent tier when no model matches', () => {
    const lightOnly = availableModels.filter((m) => m.tier === 'light');
    const model = selectModelForTier('heavy', lightOnly);
    // Should fall back since no heavy models
    expect(model).toBeDefined();
  });

  it('returns undefined for empty model list', () => {
    expect(selectModelForTier('light', [])).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify failure**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/router.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement router**

Create `src/lib/ai/router.ts`:

```typescript
import { estimateTokens } from '@/lib/ai/token-estimator';
import type { ModelInfo } from '@/lib/ai/models';

type Tier = 'light' | 'standard' | 'heavy';

// Keyword → tier mapping (first match wins)
const KEYWORD_RULES: Array<{ patterns: RegExp[]; tier: Tier }> = [
  {
    patterns: [/```/],
    tier: 'standard',
  },
  {
    patterns: [/翻訳/, /translate/i, /要約/, /summary/i, /summarize/i],
    tier: 'light',
  },
  {
    patterns: [/分析/, /比較/, /レビュー/, /設計/, /analyze/i, /compare/i, /review/i, /design/i],
    tier: 'standard',
  },
  {
    patterns: [/論文/, /研究/, /戦略/, /thesis/i, /research/i, /strategy/i],
    tier: 'heavy',
  },
];

// Token thresholds for tier detection
const TOKEN_THRESHOLDS = {
  light: 500,
  standard: 2000,
} as const;

/**
 * Detect the recommended tier based on message content.
 */
export function detectTier(text: string): Tier {
  // Check keyword rules first
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return rule.tier;
      }
    }
  }

  // Fall back to token-count based detection
  const tokens = estimateTokens(text);
  if (tokens <= TOKEN_THRESHOLDS.light) return 'light';
  if (tokens <= TOKEN_THRESHOLDS.standard) return 'standard';
  return 'heavy';
}

/**
 * Select the cheapest available model for a given tier.
 * Falls back to adjacent tiers if no model matches.
 */
export function selectModelForTier(
  tier: Tier,
  availableModels: ModelInfo[],
): ModelInfo | undefined {
  if (availableModels.length === 0) return undefined;

  // Try exact tier first
  const tierModels = availableModels
    .filter((m) => m.tier === tier)
    .sort((a, b) => a.inputPricePer1k - b.inputPricePer1k);

  if (tierModels.length > 0) return tierModels[0];

  // Fallback order: light → standard → heavy
  const fallbackOrder: Tier[] =
    tier === 'light'
      ? ['standard', 'heavy']
      : tier === 'heavy'
        ? ['standard', 'light']
        : ['light', 'heavy'];

  for (const fallback of fallbackOrder) {
    const models = availableModels
      .filter((m) => m.tier === fallback)
      .sort((a, b) => a.inputPricePer1k - b.inputPricePer1k);
    if (models.length > 0) return models[0];
  }

  return availableModels[0]; // Last resort
}

/**
 * Auto-route: determine the best model for a message.
 * If a preset with recommended_model is provided, use that.
 * Otherwise, detect tier from content and select cheapest model.
 */
export function autoRoute(
  text: string,
  availableModels: ModelInfo[],
  presetRecommendedModel?: string | null,
): ModelInfo | undefined {
  // Preset override
  if (presetRecommendedModel) {
    const preset = availableModels.find((m) => m.id === presetRecommendedModel);
    if (preset) return preset;
  }

  const tier = detectTier(text);
  return selectModelForTier(tier, availableModels);
}
```

- [ ] **Step 8: Run router tests**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/router.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/token-estimator.ts src/lib/ai/router.ts __tests__/lib/ai/token-estimator.test.ts __tests__/lib/ai/router.test.ts
git commit -m "feat(phase2): add auto-routing engine with tier detection and model selection"
```

---

## Task 5: Cost Estimation Engine

**Files:**
- Create: `src/lib/ai/cost-estimator.ts`
- Create: `src/app/api/estimate/route.ts`
- Create: `__tests__/lib/ai/cost-estimator.test.ts`

- [ ] **Step 1: Write cost estimator tests**

Create `__tests__/lib/ai/cost-estimator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateCost, formatCostMessage } from '@/lib/ai/cost-estimator';

describe('estimateCost', () => {
  const pricing = { inputPricePer1k: 0.45, outputPricePer1k: 2.25, maxTokens: 64000 };

  it('calculates estimated cost from tokens', () => {
    const result = estimateCost(1000, 500, pricing);
    // (1000/1000)*0.45 + (500/1000)*2.25 = 0.45 + 1.125 = 1.575
    expect(result.estimatedCostJpy).toBeCloseTo(1.575);
  });

  it('calculates max cost using maxTokens', () => {
    const result = estimateCost(1000, 500, pricing);
    // max = (1000/1000)*0.45 + (64000/1000)*2.25 = 0.45 + 144 = 144.45
    expect(result.maxCostJpy).toBeCloseTo(144.45);
  });

  it('returns zero for zero tokens', () => {
    const result = estimateCost(0, 0, pricing);
    expect(result.estimatedCostJpy).toBe(0);
  });
});

describe('formatCostMessage', () => {
  it('formats cost message with estimate and max', () => {
    const msg = formatCostMessage(12.5, 85);
    expect(msg).toContain('¥12.5');
    expect(msg).toContain('¥85');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/cost-estimator.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement cost estimator**

Create `src/lib/ai/cost-estimator.ts`:

```typescript
interface PricingInfo {
  inputPricePer1k: number;
  outputPricePer1k: number;
  maxTokens: number;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostJpy: number;
  maxCostJpy: number;
  message: string;
}

// Default output token estimates by tier (when no historical data)
export const DEFAULT_OUTPUT_TOKENS: Record<string, number> = {
  light: 500,
  standard: 1000,
  heavy: 2000,
};

/**
 * Calculate cost estimate from token counts and model pricing.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: PricingInfo,
): CostEstimate {
  const estimatedCostJpy =
    (inputTokens / 1000) * pricing.inputPricePer1k +
    (outputTokens / 1000) * pricing.outputPricePer1k;

  const maxCostJpy =
    (inputTokens / 1000) * pricing.inputPricePer1k +
    (pricing.maxTokens / 1000) * pricing.outputPricePer1k;

  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostJpy: Math.round(estimatedCostJpy * 100) / 100,
    maxCostJpy: Math.round(maxCostJpy * 100) / 100,
    message: formatCostMessage(estimatedCostJpy, maxCostJpy),
  };
}

/**
 * Format a human-readable cost message.
 */
export function formatCostMessage(estimated: number, max: number): string {
  const estStr = `¥${Math.round(estimated * 10) / 10}`;
  const maxStr = `¥${Math.round(max * 10) / 10}`;
  return `推定 ${estStr}（最大 ${maxStr} 程度になる可能性があります）`;
}
```

- [ ] **Step 4: Run tests**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/ai/cost-estimator.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement POST /api/estimate**

Create `src/app/api/estimate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import { getModelById, getAvailableModels } from '@/lib/ai/models';
import { estimateConversationTokens } from '@/lib/ai/token-estimator';
import { estimateCost, DEFAULT_OUTPUT_TOKENS } from '@/lib/ai/cost-estimator';
import { autoRoute } from '@/lib/ai/router';

// POST /api/estimate — Estimate cost before sending
export async function POST(request: NextRequest) {
  try {
    await resolveUser(request.headers.get('authorization'));

    const body = await request.json() as {
      messages: Array<{ content: string }>;
      modelId: string;
      mode?: 'auto' | 'fixed';
      presetRecommendedModel?: string | null;
    };

    // Resolve model (auto-route if mode=auto)
    let model = getModelById(body.modelId);
    if (body.mode === 'auto') {
      const lastMessage = body.messages[body.messages.length - 1];
      const available = getAvailableModels();
      const routed = autoRoute(
        lastMessage?.content ?? '',
        available,
        body.presetRecommendedModel,
      );
      if (routed) model = routed;
    }

    if (!model) {
      return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
    }

    // Estimate input tokens
    const inputTokens = estimateConversationTokens(body.messages);

    // Estimate output tokens from historical average
    const supabase = createServiceClient();
    const { data: avgData } = await supabase
      .from('usage_logs')
      .select('output_tokens')
      .eq('model_id', model.id)
      .order('created_at', { ascending: false })
      .limit(50);

    let outputTokens: number;
    if (avgData && avgData.length >= 5) {
      outputTokens = Math.ceil(
        avgData.reduce((sum, row) => sum + row.output_tokens, 0) / avgData.length,
      );
    } else {
      outputTokens = DEFAULT_OUTPUT_TOKENS[model.tier] ?? 1000;
    }

    // Get pricing from DB (more accurate than hardcoded)
    const { data: pricing } = await supabase
      .from('model_pricing')
      .select('input_price_per_1k, output_price_per_1k')
      .eq('model_id', model.id)
      .single();

    const pricingInfo = pricing
      ? { inputPricePer1k: pricing.input_price_per_1k, outputPricePer1k: pricing.output_price_per_1k, maxTokens: model.maxTokens }
      : { inputPricePer1k: model.inputPricePer1k, outputPricePer1k: model.outputPricePer1k, maxTokens: model.maxTokens };

    const estimate = estimateCost(inputTokens, outputTokens, pricingInfo);

    return NextResponse.json({
      ...estimate,
      model: model.id,
      modelDisplayName: model.displayName,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 6: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/cost-estimator.ts src/app/api/estimate/ __tests__/lib/ai/cost-estimator.test.ts
git commit -m "feat(phase2): add cost estimation engine and /api/estimate endpoint"
```

---

## Task 6: Slack Notification

**Files:**
- Create: `src/lib/slack/notify.ts`
- Create: `__tests__/lib/slack/notify.test.ts`

- [ ] **Step 1: Write notification tests**

Create `__tests__/lib/slack/notify.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatHighCostAlert, formatBudgetAlert, shouldSendBudgetAlert } from '@/lib/slack/notify';

describe('formatHighCostAlert', () => {
  it('formats a high cost alert message', () => {
    const msg = formatHighCostAlert({
      userName: '田中太郎',
      modelName: 'Claude Opus',
      estimatedCost: 2350,
      sessionTitle: '新規プロジェクト企画',
    });
    expect(msg).toContain('田中太郎');
    expect(msg).toContain('Claude Opus');
    expect(msg).toContain('¥2,350');
  });
});

describe('formatBudgetAlert', () => {
  it('formats 80% budget alert', () => {
    const msg = formatBudgetAlert({
      orgName: 'MEGAPHONE',
      usedAmount: 40000,
      budgetAmount: 50000,
      percentage: 80,
    });
    expect(msg).toContain('MEGAPHONE');
    expect(msg).toContain('80%');
  });

  it('formats 100% budget alert', () => {
    const msg = formatBudgetAlert({
      orgName: 'MEGAPHONE',
      usedAmount: 52300,
      budgetAmount: 50000,
      percentage: 105,
    });
    expect(msg).toContain('超過');
  });
});

describe('shouldSendBudgetAlert', () => {
  it('returns 80 when crossing 80% threshold', () => {
    expect(shouldSendBudgetAlert(80, 100, false, false)).toBe(80);
  });

  it('returns 100 when crossing 100% threshold', () => {
    expect(shouldSendBudgetAlert(100, 100, true, false)).toBe(100);
  });

  it('returns null when alert already sent', () => {
    expect(shouldSendBudgetAlert(85, 100, true, false)).toBeNull();
  });

  it('returns null when below 80%', () => {
    expect(shouldSendBudgetAlert(70, 100, false, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/slack/notify.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement Slack notification**

Create `src/lib/slack/notify.ts`:

```typescript
interface HighCostAlertParams {
  userName: string;
  modelName: string;
  estimatedCost: number;
  sessionTitle: string | null;
}

interface BudgetAlertParams {
  orgName: string;
  usedAmount: number;
  budgetAmount: number;
  percentage: number;
}

function formatJpy(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

export function formatHighCostAlert(params: HighCostAlertParams): string {
  return [
    ':bell: *高額リクエスト承認依頼*',
    '━━━━━━━━━━━━━━━━━',
    `ユーザー: ${params.userName}`,
    `モデル: ${params.modelName}`,
    `推定コスト: ${formatJpy(Math.round(params.estimatedCost))}`,
    `セッション: 「${params.sessionTitle ?? '無題'}」`,
    '━━━━━━━━━━━━━━━━━',
    '管理者ダッシュボードで承認/却下してください',
  ].join('\n');
}

export function formatBudgetAlert(params: BudgetAlertParams): string {
  const isOver = params.percentage >= 100;
  const emoji = isOver ? ':rotating_light:' : ':warning:';
  const title = isOver ? '月間予算超過' : `月間予算アラート（${Math.round(params.percentage)}%到達）`;

  const lines = [
    `${emoji} *${title}*`,
    '━━━━━━━━━━━━━━━━━',
    `組織: ${params.orgName}`,
    `利用額: ${formatJpy(Math.round(params.usedAmount))} / ${formatJpy(Math.round(params.budgetAmount))}（${Math.round(params.percentage)}%）`,
  ];

  if (isOver) {
    lines.push(`超過: ${formatJpy(Math.round(params.usedAmount - params.budgetAmount))}`);
  } else {
    lines.push(`残り: ${formatJpy(Math.round(params.budgetAmount - params.usedAmount))}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Determine if a budget alert should be sent.
 * Returns the threshold level (80 or 100) or null if no alert needed.
 */
export function shouldSendBudgetAlert(
  usedAmount: number,
  budgetAmount: number,
  alertSent80: boolean,
  alertSent100: boolean,
): 80 | 100 | null {
  if (budgetAmount <= 0) return null;
  const percentage = (usedAmount / budgetAmount) * 100;

  if (percentage >= 100 && !alertSent100) return 100;
  if (percentage >= 80 && !alertSent80) return 80;
  return null;
}

/**
 * Send a message to Slack via Incoming Webhook.
 */
export async function sendSlackNotification(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL not configured, skipping notification');
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err);
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ai-dashboard && npx vitest run __tests__/lib/slack/notify.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/slack/notify.ts __tests__/lib/slack/notify.test.ts
git commit -m "feat(phase2): add Slack notification utility for cost alerts"
```

---

## Task 7: Chat API Integration

Integrate presets, auto-routing, cost checking, and budget monitoring into `POST /api/chat`.

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/stores/chat-store.ts`

- [ ] **Step 1: Update ChatTab in Zustand store**

Add `presetId` to `ChatTab` in `src/stores/chat-store.ts`:

```typescript
interface ChatTab {
  sessionId: string;
  title: string;
  modelId: string;
  mode: 'auto' | 'fixed' | 'compare';
  presetId: string | null;  // ADD THIS
}
```

Add `updateTabPreset` action:

```typescript
updateTabPreset: (sessionId: string, presetId: string | null) => void;
```

Implementation:
```typescript
updateTabPreset: (sessionId, presetId) => set(state => ({
  tabs: state.tabs.map(t => t.sessionId === sessionId ? { ...t, presetId } : t),
})),
```

Update `openTab` to include `presetId: null` in the new tab default.

- [ ] **Step 2: Update POST /api/chat**

Modify `src/app/api/chat/route.ts` to add:

1. Accept `mode` and `presetId` in request body
2. If `presetId` is set, fetch preset's `system_prompt` and `recommended_model`
3. If `mode === 'auto'`, use `autoRoute()` to determine model
4. After `onFinish`, check budget thresholds and send Slack alerts

Key changes to the request body type:
```typescript
const { messages, modelId, sessionId, mode, presetId } = (await request.json()) as {
  messages: UIMessage[];
  modelId: string;
  sessionId: string;
  mode?: 'auto' | 'fixed';
  presetId?: string | null;
};
```

In the handler, before `streamText`:
```typescript
// Resolve preset if set
let systemPrompt: string | undefined;
let resolvedModelId = modelId;

if (presetId) {
  const { data: preset } = await supabase
    .from('presets')
    .select('system_prompt, recommended_model')
    .eq('id', presetId)
    .single();

  if (preset) {
    systemPrompt = preset.system_prompt;
    if (mode === 'auto' && preset.recommended_model) {
      resolvedModelId = preset.recommended_model;
    }
  }
}

// Auto-route if mode=auto and no preset override
if (mode === 'auto' && resolvedModelId === modelId) {
  const lastMsg = messages[messages.length - 1];
  const lastText = lastMsg?.parts
    ?.filter((p: { type: string }) => p.type === 'text')
    .map((p: { text: string }) => p.text)
    .join('') ?? '';
  const available = getAvailableModels();
  const routed = autoRoute(lastText, available);
  if (routed) resolvedModelId = routed.id;
}

const model = getModelById(resolvedModelId);
```

Add `system` option to `streamText` call:
```typescript
const result = streamText({
  model: provider,
  system: systemPrompt,
  messages: await convertToModelMessages(messages),
  // ...
});
```

In `onFinish`, add budget check:
```typescript
// Budget monitoring (after cost recording)
if (user.active_organization_id) {
  const { data: org } = await supabase
    .from('organizations')
    .select('name, monthly_budget_jpy, budget_alert_sent_80, budget_alert_sent_100, budget_alert_month')
    .eq('id', user.active_organization_id)
    .single();

  if (org && org.monthly_budget_jpy > 0) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let alertSent80 = org.budget_alert_sent_80;
    let alertSent100 = org.budget_alert_sent_100;

    // Reset if new month
    if (org.budget_alert_month !== currentMonth) {
      alertSent80 = false;
      alertSent100 = false;
      await supabase
        .from('organizations')
        .update({ budget_alert_sent_80: false, budget_alert_sent_100: false, budget_alert_month: currentMonth })
        .eq('id', user.active_organization_id);
    }

    // Get monthly total
    const startOfMonth = `${currentMonth}-01T00:00:00Z`;
    const { data: usageSum } = await supabase
      .from('usage_logs')
      .select('cost_jpy')
      .gte('created_at', startOfMonth);

    const totalCost = (usageSum ?? []).reduce((sum, row) => sum + Number(row.cost_jpy), 0);
    const alertLevel = shouldSendBudgetAlert(totalCost, Number(org.monthly_budget_jpy), alertSent80, alertSent100);

    if (alertLevel) {
      const percentage = (totalCost / Number(org.monthly_budget_jpy)) * 100;
      const alertText = formatBudgetAlert({
        orgName: org.name,
        usedAmount: totalCost,
        budgetAmount: Number(org.monthly_budget_jpy),
        percentage,
      });
      sendSlackNotification(alertText);

      await supabase
        .from('organizations')
        .update({
          [`budget_alert_sent_${alertLevel}`]: true,
          budget_alert_month: currentMonth,
        })
        .eq('id', user.active_organization_id);
    }
  }
}
```

Add imports at top of file:
```typescript
import { getAvailableModels } from '@/lib/ai/models';
import { autoRoute } from '@/lib/ai/router';
import { shouldSendBudgetAlert } from '@/lib/slack/notify';
import { formatBudgetAlert, sendSlackNotification } from '@/lib/slack/notify';
```

- [ ] **Step 3: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
cd ai-dashboard && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts src/stores/chat-store.ts
git commit -m "feat(phase2): integrate presets, auto-routing, and budget alerts into chat API"
```

---

## Task 8: Preset Selector + Chat UI Updates

**Files:**
- Create: `src/components/chat/preset-selector.tsx`
- Create: `src/components/chat/cost-display.tsx`
- Create: `src/components/chat/cost-confirm-dialog.tsx`
- Modify: `src/app/chat/[id]/page.tsx`
- Modify: `src/components/chat/chat-input.tsx`
- Modify: `src/components/chat/model-selector.tsx`

- [ ] **Step 1: Create PresetSelector component**

Create `src/components/chat/preset-selector.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";

interface Preset {
  id: string;
  name: string;
  icon: string | null;
  scope: string;
  recommended_model: string | null;
  is_enabled_by_user: boolean;
}

interface PresetSelectorProps {
  selectedPresetId: string | null;
  onPresetSelect: (presetId: string | null, recommendedModel: string | null) => void;
}

export function PresetSelector({
  selectedPresetId,
  onPresetSelect,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch("/api/presets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPresets(data.filter((p: Preset) => p.is_enabled_by_user));
        }
      } catch (err) {
        console.error("[PresetSelector] Failed to load presets:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selected = presets.find((p) => p.id === selectedPresetId);

  if (loading || presets.length === 0) return null;

  const scopeLabels: Record<string, string> = {
    personal: "個人",
    team: "チーム",
    organization: "組織",
  };

  const grouped = presets.reduce<Record<string, Preset[]>>((acc, p) => {
    const key = p.scope;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <SparklesIcon className="size-3.5" />
            <span className="truncate max-w-[120px]">
              {selected ? `${selected.icon ?? ''} ${selected.name}`.trim() : "プリセット"}
            </span>
            <ChevronDownIcon className="size-3.5 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuItem
          onSelect={() => onPresetSelect(null, null)}
          className="text-muted-foreground"
        >
          なし（プリセット解除）
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {Object.entries(grouped).map(([scope, items]) => (
          <DropdownMenuGroup key={scope}>
            <DropdownMenuLabel>{scopeLabels[scope] ?? scope}</DropdownMenuLabel>
            {items.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onSelect={() => onPresetSelect(preset.id, preset.recommended_model)}
              >
                {preset.icon && <span className="mr-1.5">{preset.icon}</span>}
                {preset.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Create CostDisplay component**

Create `src/components/chat/cost-display.tsx`:

```typescript
"use client";

interface CostDisplayProps {
  message: string | null;
  estimatedCost: number | null;
}

export function CostDisplay({ message, estimatedCost }: CostDisplayProps) {
  if (!message) return null;

  const colorClass =
    estimatedCost !== null && estimatedCost > 1000
      ? "text-red-500"
      : estimatedCost !== null && estimatedCost > 500
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <div className={`px-4 pb-1 text-xs ${colorClass}`}>
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Create CostConfirmDialog component**

Create `src/components/chat/cost-confirm-dialog.tsx`:

```typescript
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CostConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  estimatedCost: number;
  maxCost: number;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  requiresApproval: boolean;
}

export function CostConfirmDialog({
  open,
  onConfirm,
  onCancel,
  estimatedCost,
  maxCost,
  modelName,
  inputTokens,
  outputTokens,
  requiresApproval,
}: CostConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {requiresApproval ? "管理者承認が必要です" : "コスト確認"}
          </DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? "このリクエストは推定コストが ¥1,000 を超えているため、管理者の承認が必要です。"
              : "このリクエストの推定コストが ¥500 を超えています。"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">モデル</span>
            <span className="font-medium">{modelName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">推定入力トークン</span>
            <span>{inputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">推定出力トークン</span>
            <span>{outputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">推定コスト</span>
            <span className="font-bold text-amber-600">
              ¥{Math.round(estimatedCost).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">最大コスト</span>
            <span className="text-xs text-muted-foreground">
              ¥{Math.round(maxCost).toLocaleString()}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={onConfirm}>
            {requiresApproval ? "承認リクエストを送信" : "送信する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add "自動" option to ModelSelector**

In `src/components/chat/model-selector.tsx`, add an "自動" option at the top of the dropdown before provider groups:

```typescript
// Before the provider groups:
<DropdownMenuItem
  onSelect={() => onModelSelect('auto')}
  className="flex items-center justify-between gap-3"
>
  <span>自動選択</span>
  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700">
    Auto
  </span>
</DropdownMenuItem>
<DropdownMenuSeparator />
```

Update the trigger to show "自動" when `selectedModelId === 'auto'`.

- [ ] **Step 5: Update chat-input.tsx to include cost display slot**

Modify `src/components/chat/chat-input.tsx` to accept and render a `costDisplay` slot:

Add prop:
```typescript
interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  costMessage?: string | null;      // ADD
  estimatedCost?: number | null;    // ADD
}
```

Add the cost display below the textarea:
```typescript
import { CostDisplay } from "./cost-display";

// In the return, after the flex container:
{costMessage && (
  <CostDisplay message={costMessage} estimatedCost={estimatedCost ?? null} />
)}
```

- [ ] **Step 6: Update chat session page**

Modify `src/app/chat/[id]/page.tsx` to integrate:
- PresetSelector in toolbar
- Cost estimation on message input (debounced)
- CostConfirmDialog before sending high-cost messages
- Pass cost info to ChatInput

Key additions:
```typescript
import { PresetSelector } from "@/components/chat/preset-selector";
import { CostConfirmDialog } from "@/components/chat/cost-confirm-dialog";
```

Add state for preset, cost estimation, and confirmation dialog. Wire up the PresetSelector next to ModelSelector in the toolbar. Add debounced cost estimation on input change. Show CostConfirmDialog for ¥500+ estimates.

This task involves significant UI wiring. The subagent implementing this should read the full `chat/[id]/page.tsx` (shown above) and integrate all pieces.

- [ ] **Step 7: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/preset-selector.tsx src/components/chat/cost-display.tsx src/components/chat/cost-confirm-dialog.tsx src/components/chat/model-selector.tsx src/components/chat/chat-input.tsx src/app/chat/[id]/page.tsx
git commit -m "feat(phase2): add preset selector, cost display, and cost confirmation to chat UI"
```

---

## Task 9: Admin Layout + Pricing Management

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/pricing/page.tsx`
- Create: `src/app/api/admin/pricing/route.ts`
- Create: `src/app/api/admin/pricing/[id]/route.ts`
- Create: `src/components/admin/pricing-table.tsx`

- [ ] **Step 1: Create admin layout with permission guard**

Create `src/app/admin/layout.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/client";
import type { UserRole } from "@/lib/supabase/types";

interface AdminUser {
  role: UserRole;
  teamMemberships: Array<{ team_id: string; role: string }>;
  orgMemberships: Array<{ organization_id: string; role: string }>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    async function checkPermission() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("No token");

        // Use a lightweight check — fetch user role
        const res = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (data.role === "member") {
          // No admin access
          router.push("/chat");
          return;
        }

        setAdminUser(data);
      } catch {
        router.push("/chat");
      } finally {
        setChecking(false);
      }
    }

    checkPermission();
  }, [user, loading, router]);

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">権限を確認中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Side navigation */}
      <nav className="w-56 border-r bg-gray-50 p-4">
        <h2 className="mb-4 text-lg font-semibold">管理者</h2>
        <ul className="space-y-1">
          <li>
            <a
              href="/admin/usage"
              className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
            >
              利用状況
            </a>
          </li>
          <li>
            <a
              href="/admin/pricing"
              className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
            >
              モデル単価
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create admin index redirect**

Create `src/app/admin/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/usage");
}
```

- [ ] **Step 3: Implement pricing API**

Create `src/app/api/admin/pricing/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/pricing — List all model pricing
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));

    // Any admin role can view
    if (!ctx.isSystemAdmin && ctx.orgMemberships.every(o => o.role !== 'org_admin') &&
        ctx.teamMemberships.every(t => t.role !== 'owner' && t.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('model_pricing')
      .select('*')
      .order('provider')
      .order('display_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

Create `src/app/api/admin/pricing/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// PATCH /api/admin/pricing/[id] — Update model pricing (system_admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));

    if (!ctx.isSystemAdmin) {
      return NextResponse.json({ error: 'Forbidden: system_admin only' }, { status: 403 });
    }

    const body = await request.json() as {
      input_price_per_1k?: number;
      output_price_per_1k?: number;
    };

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('model_pricing')
      .update({
        ...(body.input_price_per_1k !== undefined && { input_price_per_1k: body.input_price_per_1k }),
        ...(body.output_price_per_1k !== undefined && { output_price_per_1k: body.output_price_per_1k }),
        updated_by: ctx.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 4: Create pricing page UI**

Create `src/app/admin/pricing/page.tsx` with an editable table using shadcn/ui components. The table shows provider, model name, input price, output price per 1K tokens. system_admin users see edit buttons on each row for inline editing.

Create `src/components/admin/pricing-table.tsx` as the table component.

- [ ] **Step 5: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/ src/app/api/admin/pricing/ src/components/admin/pricing-table.tsx
git commit -m "feat(phase2): add admin layout, pricing API, and pricing management page"
```

---

## Task 10: Admin Usage Dashboard

**Files:**
- Create: `src/app/api/admin/usage/route.ts`
- Create: `src/app/api/admin/usage/daily/route.ts`
- Create: `src/app/api/admin/approval/[id]/route.ts`
- Create: `src/app/admin/usage/page.tsx`
- Create: `src/components/admin/usage-summary-cards.tsx`
- Create: `src/components/admin/usage-daily-chart.tsx`
- Create: `src/components/admin/usage-by-user-table.tsx`
- Create: `src/components/admin/usage-by-model-table.tsx`

- [ ] **Step 1: Install recharts**

```bash
cd ai-dashboard && npm install recharts
```

- [ ] **Step 2: Implement usage summary API**

Create `src/app/api/admin/usage/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/usage?period=2026-04
export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveUser(request.headers.get('authorization'));
    const period = request.nextUrl.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
    const startDate = `${period}-01T00:00:00Z`;
    const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString();

    const supabase = createServiceClient();

    // Fetch usage logs for the period
    const { data: logs, error } = await supabase
      .from('usage_logs')
      .select('user_id, model_id, provider, input_tokens, output_tokens, cost_jpy, created_at')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get org budget if applicable
    let budget = null;
    if (ctx.user.active_organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('monthly_budget_jpy, name')
        .eq('id', ctx.user.active_organization_id)
        .single();
      budget = org;
    }

    // Aggregate
    const totalCost = (logs ?? []).reduce((sum, l) => sum + Number(l.cost_jpy), 0);
    const totalRequests = (logs ?? []).length;
    const uniqueUsers = new Set((logs ?? []).map((l) => l.user_id)).size;

    // By user
    const byUser: Record<string, { requests: number; cost: number; models: Record<string, number> }> = {};
    for (const log of logs ?? []) {
      if (!byUser[log.user_id]) byUser[log.user_id] = { requests: 0, cost: 0, models: {} };
      byUser[log.user_id].requests++;
      byUser[log.user_id].cost += Number(log.cost_jpy);
      byUser[log.user_id].models[log.model_id] = (byUser[log.user_id].models[log.model_id] ?? 0) + 1;
    }

    // By model
    const byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }> = {};
    for (const log of logs ?? []) {
      if (!byModel[log.model_id]) byModel[log.model_id] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      byModel[log.model_id].requests++;
      byModel[log.model_id].inputTokens += log.input_tokens;
      byModel[log.model_id].outputTokens += log.output_tokens;
      byModel[log.model_id].cost += Number(log.cost_jpy);
    }

    // Fetch user display names
    const userIds = Object.keys(byUser);
    const { data: users } = userIds.length > 0
      ? await supabase.from('users').select('id, display_name, email').in('id', userIds)
      : { data: [] };

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return NextResponse.json({
      period,
      totalCost: Math.round(totalCost * 100) / 100,
      totalRequests,
      activeUsers: uniqueUsers,
      budget: budget ? { amount: Number(budget.monthly_budget_jpy), orgName: budget.name } : null,
      byUser: Object.entries(byUser).map(([userId, data]) => ({
        userId,
        displayName: userMap.get(userId)?.display_name ?? userMap.get(userId)?.email ?? userId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
        topModel: Object.entries(data.models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      })).sort((a, b) => b.cost - a.cost),
      byModel: Object.entries(byModel).map(([modelId, data]) => ({
        modelId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
      })).sort((a, b) => b.cost - a.cost),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 3: Implement daily usage API**

Create `src/app/api/admin/usage/daily/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/usage/daily?period=2026-04
export async function GET(request: NextRequest) {
  try {
    await resolveUser(request.headers.get('authorization'));
    const period = request.nextUrl.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
    const startDate = `${period}-01T00:00:00Z`;
    const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString();

    const supabase = createServiceClient();

    const { data: logs, error } = await supabase
      .from('usage_logs')
      .select('model_id, cost_jpy, created_at')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by date
    const daily: Record<string, Record<string, number>> = {};
    for (const log of logs ?? []) {
      const date = log.created_at.slice(0, 10);
      if (!daily[date]) daily[date] = {};
      daily[date][log.model_id] = (daily[date][log.model_id] ?? 0) + Number(log.cost_jpy);
    }

    const result = Object.entries(daily)
      .map(([date, models]) => ({
        date,
        total: Math.round(Object.values(models).reduce((s, v) => s + v, 0) * 100) / 100,
        ...Object.fromEntries(
          Object.entries(models).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 4: Implement approval API**

Create `src/app/api/admin/approval/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';

// PATCH /api/admin/approval/[id] — Approve or reject a pending usage request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await resolveUser(request.headers.get('authorization'));

    if (!ctx.isSystemAdmin && ctx.orgMemberships.every(o => o.role !== 'org_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as { status: 'admin_approved' | 'rejected' };

    if (!['admin_approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('usage_logs')
      .update({ approval_status: body.status })
      .eq('id', id)
      .eq('approval_status', 'pending')
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 5: Create admin usage dashboard page**

Create `src/app/admin/usage/page.tsx` as a client component that fetches from `/api/admin/usage` and `/api/admin/usage/daily`, then renders:
1. Summary cards (UsageSummaryCards component)
2. Daily cost chart (UsageDailyChart component using recharts AreaChart)
3. User breakdown table (UsageByUserTable component)
4. Model breakdown table (UsageByModelTable component)

Create the 4 admin components in `src/components/admin/`:
- `usage-summary-cards.tsx` — 4 cards: total cost, budget progress bar, requests, active users
- `usage-daily-chart.tsx` — recharts AreaChart with date x-axis, cost y-axis
- `usage-by-user-table.tsx` — sortable table with user, requests, cost, top model
- `usage-by-model-table.tsx` — table with model, requests, tokens, cost + pie chart

Each component receives props from the page and is a presentational component.

- [ ] **Step 6: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 7: Run all tests**

```bash
cd ai-dashboard && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/ src/app/admin/usage/ src/components/admin/
git commit -m "feat(phase2): add admin usage dashboard with daily charts and breakdowns"
```

---

## Task 11: Preset Management UI

A page or modal where users can view all available presets, toggle them on/off, and create/edit their own.

**Files:**
- Create: `src/app/chat/presets/page.tsx`

- [ ] **Step 1: Create presets management page**

Create `src/app/chat/presets/page.tsx` as a client component that:
- Fetches `GET /api/presets` to list all available presets
- Groups by scope (個人 / チーム / 組織)
- Each preset shows: icon, name, description, recommended model, toggle switch
- Toggle calls `POST /api/presets/[id]/toggle`
- "新しいプリセット作成" button opens a form (Dialog)
- Form fields: name, description, system_prompt (textarea), recommended_model (dropdown from `/api/models`), icon, scope
- For team/org scope, show selector for target team/org
- Submit calls `POST /api/presets`
- Edit button (for owned presets) → same form pre-filled → `PATCH /api/presets/[id]`
- Delete button → confirm → `DELETE /api/presets/[id]`

- [ ] **Step 2: Add link to presets page in header or sidebar**

Add a link/button to `/chat/presets` in the session sidebar or header so users can access preset management.

- [ ] **Step 3: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/chat/presets/
git commit -m "feat(phase2): add preset management page with CRUD and toggle UI"
```

---

## Task 12: Final Integration + Context Update

**Files:**
- Modify: `ai-dashboard/context/context.md`

- [ ] **Step 1: Run all tests**

```bash
cd ai-dashboard && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run type check**

```bash
cd ai-dashboard && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Ask user to run `npm run dev` and verify:
1. Chat with preset selection works
2. Auto mode selects appropriate model
3. Cost estimate appears below input
4. ¥500+ shows confirmation dialog
5. `/admin/pricing` shows model pricing table
6. `/admin/usage` shows dashboard with charts
7. Preset management at `/chat/presets` works

- [ ] **Step 4: Update context/context.md**

Add Phase 2 sections:
- New tables (presets, user_preset_preferences)
- New API endpoints (presets, estimate, admin/pricing, admin/usage, admin/approval)
- New components (preset-selector, cost-display, cost-confirm-dialog, admin/*)
- New lib files (router.ts, token-estimator.ts, cost-estimator.ts, slack/notify.ts, auth/resolve-user.ts)
- Updated store (presetId in ChatTab)
- Updated environment variables (SLACK_WEBHOOK_URL)
- Mark Phase 2 as ✅ 実装済み

- [ ] **Step 5: Commit**

```bash
git add ai-dashboard/context/context.md
git commit -m "docs: update context.md for Phase 2 completion"
```

---

## Environment Variables to Add

```env
# Slack (Phase 2)
SLACK_WEBHOOK_URL=         # Incoming Webhook URL for notifications
```

## Dependencies to Install

```bash
npm install recharts
```

No other new dependencies required. Token estimation uses character heuristics (no tiktoken needed).
