-- =============================================================================
-- 001_initial_schema.sql
-- AI Dashboard - Initial database schema
-- Organization / Team / Credit structure with Firebase Auth sync
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================
CREATE TABLE organizations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        UNIQUE,
  credits         integer     NOT NULL DEFAULT 0,
  member_count    integer     NOT NULL DEFAULT 0,
  team_count      integer     NOT NULL DEFAULT 0,
  plan            text        NOT NULL DEFAULT 'trial',
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  plan_billing_cycle text,
  feature_restrictions jsonb  NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organizations_credits_non_negative CHECK (credits >= 0),
  CONSTRAINT organizations_member_count_non_negative CHECK (member_count >= 0),
  CONSTRAINT organizations_team_count_non_negative CHECK (team_count >= 0),
  CONSTRAINT organizations_plan_check CHECK (plan IN ('organization', 'trial', 'outage')),
  CONSTRAINT organizations_billing_cycle_check CHECK (plan_billing_cycle IS NULL OR plan_billing_cycle IN ('monthly', 'yearly'))
);

COMMENT ON TABLE organizations IS 'Top-level organizational entities that own teams, members, and a shared credit pool';

CREATE INDEX idx_organizations_slug ON organizations (slug) WHERE slug IS NOT NULL;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- USERS (synced from Firebase Auth)
-- =============================================================================
CREATE TABLE users (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid            text        UNIQUE NOT NULL,
  email                   text        NOT NULL,
  display_name            text        NOT NULL DEFAULT '',
  role                    text        NOT NULL DEFAULT 'member',
  credits                 integer     NOT NULL DEFAULT 0,
  active_organization_id  uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  active_team_id          uuid,  -- FK added after teams table is created
  plan                    text        NOT NULL DEFAULT 'trial',
  plan_started_at         timestamptz,
  plan_expires_at         timestamptz,
  plan_billing_cycle      text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_role_check CHECK (role IN ('system_admin', 'org_admin', 'member')),
  CONSTRAINT users_credits_non_negative CHECK (credits >= 0),
  CONSTRAINT users_plan_check CHECK (plan IN ('free', 'personal', 'team', 'trial', 'outage')),
  CONSTRAINT users_billing_cycle_check CHECK (plan_billing_cycle IS NULL OR plan_billing_cycle IN ('monthly', 'yearly'))
);

COMMENT ON TABLE users IS 'Application users synced from Firebase Authentication';

CREATE UNIQUE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_active_organization_id ON users (active_organization_id) WHERE active_organization_id IS NOT NULL;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- TEAMS
-- =============================================================================
CREATE TABLE teams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  owner_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  invite_code     text        UNIQUE NOT NULL,
  credits         integer     NOT NULL DEFAULT 0,
  member_count    integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teams_credits_non_negative CHECK (credits >= 0),
  CONSTRAINT teams_member_count_non_negative CHECK (member_count >= 0),
  CONSTRAINT teams_invite_code_length CHECK (char_length(invite_code) = 8)
);

COMMENT ON TABLE teams IS 'Teams within or independent of organizations; each has its own credit pool and invite code';

CREATE INDEX idx_teams_owner_id ON teams (owner_id);
CREATE INDEX idx_teams_organization_id ON teams (organization_id) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX idx_teams_invite_code ON teams (invite_code);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now add the deferred FK from users.active_team_id -> teams.id
ALTER TABLE users
  ADD CONSTRAINT users_active_team_id_fkey
  FOREIGN KEY (active_team_id) REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_users_active_team_id ON users (active_team_id) WHERE active_team_id IS NOT NULL;

-- =============================================================================
-- ORG MEMBERS (junction)
-- =============================================================================
CREATE TABLE org_members (
  id              text        PRIMARY KEY,  -- "{orgId}_{userId}"
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'member',
  display_name    text,
  email           text,
  joined_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_members_unique_membership UNIQUE (organization_id, user_id),
  CONSTRAINT org_members_role_check CHECK (role IN ('org_admin', 'member'))
);

COMMENT ON TABLE org_members IS 'Junction table linking users to organizations with role assignment';

CREATE INDEX idx_org_members_organization_id ON org_members (organization_id);
CREATE INDEX idx_org_members_user_id ON org_members (user_id);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TEAM MEMBERS (junction)
-- =============================================================================
CREATE TABLE team_members (
  id           text        PRIMARY KEY,  -- "{teamId}_{userId}"
  team_id      uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'member',
  display_name text,
  email        text,
  joined_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_unique_membership UNIQUE (team_id, user_id),
  CONSTRAINT team_members_role_check CHECK (role IN ('owner', 'admin', 'member'))
);

COMMENT ON TABLE team_members IS 'Junction table linking users to teams with role assignment';

CREATE INDEX idx_team_members_team_id ON team_members (team_id);
CREATE INDEX idx_team_members_user_id ON team_members (user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- CREDIT LOGS (personal)
-- =============================================================================
CREATE TABLE credit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  amount      integer     NOT NULL,
  balance     integer     NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credit_logs_type_not_empty CHECK (char_length(type) > 0)
);

COMMENT ON TABLE credit_logs IS 'Audit log of personal credit transactions for each user';

CREATE INDEX idx_credit_logs_user_id ON credit_logs (user_id);
CREATE INDEX idx_credit_logs_created_at ON credit_logs (created_at);

ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TEAM CREDIT LOGS
-- =============================================================================
CREATE TABLE team_credit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  amount      integer     NOT NULL,
  balance     integer     NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_credit_logs_type_not_empty CHECK (char_length(type) > 0)
);

COMMENT ON TABLE team_credit_logs IS 'Audit log of team-level credit transactions';

CREATE INDEX idx_team_credit_logs_team_id ON team_credit_logs (team_id);
CREATE INDEX idx_team_credit_logs_user_id ON team_credit_logs (user_id);
CREATE INDEX idx_team_credit_logs_created_at ON team_credit_logs (created_at);

ALTER TABLE team_credit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SESSIONS (chat sessions)
-- =============================================================================
CREATE TABLE sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text,
  owner_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  preset_id       uuid,  -- FK deferred to future migration
  mode            text        NOT NULL DEFAULT 'fixed',
  fixed_model     text,
  is_shared       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sessions_mode_check CHECK (mode IN ('auto', 'fixed', 'compare'))
);

COMMENT ON TABLE sessions IS 'Chat sessions owned by users, optionally scoped to an organization';

CREATE INDEX idx_sessions_owner_id ON sessions (owner_id);
CREATE INDEX idx_sessions_organization_id ON sessions (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_sessions_created_at ON sessions (created_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- MESSAGES
-- =============================================================================
CREATE TABLE messages (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role          text          NOT NULL,
  content       text          NOT NULL DEFAULT '',
  model_used    text,
  input_tokens  integer,
  output_tokens integer,
  cost_jpy      numeric(10,2),
  sender_id     uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT messages_input_tokens_non_negative CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CONSTRAINT messages_output_tokens_non_negative CHECK (output_tokens IS NULL OR output_tokens >= 0)
);

COMMENT ON TABLE messages IS 'Individual messages within a chat session';

CREATE INDEX idx_messages_session_id ON messages (session_id);
CREATE INDEX idx_messages_sender_id ON messages (sender_id) WHERE sender_id IS NOT NULL;
CREATE INDEX idx_messages_created_at ON messages (created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- USAGE LOGS
-- =============================================================================
CREATE TABLE usage_logs (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id         uuid          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id         uuid          REFERENCES messages(id) ON DELETE SET NULL,
  provider           text          NOT NULL,
  model_id           text          NOT NULL,
  input_tokens       integer       NOT NULL DEFAULT 0,
  output_tokens      integer       NOT NULL DEFAULT 0,
  cost_jpy           numeric(10,2) NOT NULL DEFAULT 0,
  estimated_cost_jpy numeric(10,2),
  approval_status    text          NOT NULL DEFAULT 'auto',
  created_at         timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT usage_logs_input_tokens_non_negative CHECK (input_tokens >= 0),
  CONSTRAINT usage_logs_output_tokens_non_negative CHECK (output_tokens >= 0),
  CONSTRAINT usage_logs_cost_jpy_non_negative CHECK (cost_jpy >= 0),
  CONSTRAINT usage_logs_approval_status_check CHECK (approval_status IN ('auto', 'user_approved', 'admin_approved', 'rejected'))
);

COMMENT ON TABLE usage_logs IS 'Detailed per-request usage and cost tracking for AI model calls';

CREATE INDEX idx_usage_logs_user_id ON usage_logs (user_id);
CREATE INDEX idx_usage_logs_session_id ON usage_logs (session_id);
CREATE INDEX idx_usage_logs_message_id ON usage_logs (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_usage_logs_created_at ON usage_logs (created_at);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- MODEL PRICING
-- =============================================================================
CREATE TABLE model_pricing (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text          NOT NULL,
  model_id            text          UNIQUE NOT NULL,
  display_name        text          NOT NULL,
  input_price_per_1k  numeric(10,6) NOT NULL DEFAULT 0,
  output_price_per_1k numeric(10,6) NOT NULL DEFAULT 0,
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  updated_by          uuid          REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT model_pricing_input_price_non_negative CHECK (input_price_per_1k >= 0),
  CONSTRAINT model_pricing_output_price_non_negative CHECK (output_price_per_1k >= 0)
);

COMMENT ON TABLE model_pricing IS 'Reference table of AI model pricing in JPY per 1K tokens';

CREATE INDEX idx_model_pricing_provider ON model_pricing (provider);

ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_model_pricing_updated_at
  BEFORE UPDATE ON model_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SEED DATA: Model Pricing (JPY per 1K tokens)
-- =============================================================================
INSERT INTO model_pricing (provider, model_id, display_name, input_price_per_1k, output_price_per_1k) VALUES
  ('anthropic', 'claude-opus-4-6',            'Claude Opus',    2.250,  11.250),
  ('anthropic', 'claude-sonnet-4-6',          'Claude Sonnet',  0.450,   2.250),
  ('anthropic', 'claude-haiku-4-5-20251213',  'Claude Haiku',   0.038,   0.188),
  ('openai',    'gpt-4o',                     'GPT-4o',         0.375,   1.500),
  ('openai',    'gpt-4o-mini',                'GPT-4o mini',    0.011,   0.045),
  ('openai',    'o1',                         'o1',             2.250,   9.000),
  ('google',    'gemini-2.0-pro',             'Gemini Pro',     0.188,   0.750),
  ('google',    'gemini-2.0-flash',           'Gemini Flash',   0.011,   0.045),
  ('deepseek',  'deepseek-chat',              'DeepSeek V3',    0.041,   0.165),
  ('deepseek',  'deepseek-reasoner',          'DeepSeek R1',    0.083,   0.330),
  ('xai',       'grok-3',                     'Grok 3',         0.450,   2.250);
