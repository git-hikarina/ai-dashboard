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

COMMENT ON TABLE presets IS 'Custom instruction sets (system prompts) scoped to personal, team, or organization level';

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

COMMENT ON TABLE user_preset_preferences IS 'Per-user enabled/disabled preferences for available presets';

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
