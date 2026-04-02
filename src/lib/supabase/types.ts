// =============================================================================
// Supabase Database Type Definitions
// AI Dashboard - Organization / Team / Credit structure
// =============================================================================

// ---------------------------------------------------------------------------
// Enum / Literal Union Types
// ---------------------------------------------------------------------------

/** System-wide user roles */
export type UserRole = "system_admin" | "org_admin" | "member";

/** User subscription plans */
export type UserPlan = "free" | "personal" | "team" | "trial" | "outage";

/** Organization subscription plans */
export type OrganizationPlan = "organization" | "trial" | "outage";

/** Billing cycle options */
export type BillingCycle = "monthly" | "yearly";

/** Org member roles */
export type OrgMemberRole = "org_admin" | "member";

/** Team member roles */
export type TeamMemberRole = "owner" | "admin" | "member";

/** Chat session modes */
export type SessionMode = "auto" | "fixed" | "compare";

/** Message sender roles */
export type MessageRole = "user" | "assistant" | "system";

/** Usage log approval statuses */
export type ApprovalStatus =
  | "auto"
  | "pending"
  | "user_approved"
  | "admin_approved"
  | "rejected";

/** Preset scope levels */
export type PresetScope = "personal" | "team" | "organization";

/** AI model providers */
export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "xai";

// ---------------------------------------------------------------------------
// Table Row Types
// ---------------------------------------------------------------------------

/** Users table - synced from Firebase Auth */
export interface DbUser {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  role: UserRole;
  credits: number;
  active_organization_id: string | null;
  active_team_id: string | null;
  plan: UserPlan;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  plan_billing_cycle: BillingCycle | null;
  created_at: string;
  updated_at: string;
}

/** Organizations table */
export interface DbOrganization {
  id: string;
  name: string;
  slug: string | null;
  credits: number;
  member_count: number;
  team_count: number;
  plan: OrganizationPlan;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  plan_billing_cycle: BillingCycle | null;
  feature_restrictions: Record<string, unknown>;
  monthly_budget_jpy: number;
  budget_alert_sent_80: boolean;
  budget_alert_sent_100: boolean;
  budget_alert_month: string | null;
  created_at: string;
  updated_at: string;
}

/** Org members junction table */
export interface DbOrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  display_name: string | null;
  email: string | null;
  joined_at: string;
}

/** Teams table */
export interface DbTeam {
  id: string;
  name: string;
  owner_id: string;
  organization_id: string | null;
  invite_code: string;
  credits: number;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** Team members junction table */
export interface DbTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  display_name: string | null;
  email: string | null;
  joined_at: string;
}

/** Credit logs (personal) */
export interface DbCreditLog {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  created_at: string;
}

/** Team credit logs */
export interface DbTeamCreditLog {
  id: string;
  team_id: string;
  user_id: string;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  created_at: string;
}

/** Chat sessions */
export interface DbSession {
  id: string;
  title: string | null;
  owner_id: string;
  organization_id: string | null;
  preset_id: string | null;
  mode: SessionMode;
  fixed_model: string | null;
  is_shared: boolean;
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

/** Messages within a session */
export interface DbMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_jpy: number | null;
  sender_id: string | null;
  created_at: string;
}

/** Usage logs for AI model calls */
export interface DbUsageLog {
  id: string;
  user_id: string;
  session_id: string;
  message_id: string | null;
  provider: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_jpy: number;
  estimated_cost_jpy: number | null;
  approval_status: ApprovalStatus;
  created_at: string;
}

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

/** Model pricing reference table */
export interface DbModelPricing {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  input_price_per_1k: number;
  output_price_per_1k: number;
  updated_at: string;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// Insert Types (omit server-generated fields)
// ---------------------------------------------------------------------------

export type DbUserInsert = Omit<DbUser, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbUser, "id">>;

export type DbOrganizationInsert = Omit<
  DbOrganization,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<DbOrganization, "id">>;

export type DbOrgMemberInsert = Omit<DbOrgMember, "joined_at">;

export type DbTeamInsert = Omit<DbTeam, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbTeam, "id">>;

export type DbTeamMemberInsert = Omit<DbTeamMember, "joined_at">;

export type DbCreditLogInsert = Omit<DbCreditLog, "id" | "created_at"> &
  Partial<Pick<DbCreditLog, "id">>;

export type DbTeamCreditLogInsert = Omit<
  DbTeamCreditLog,
  "id" | "created_at"
> &
  Partial<Pick<DbTeamCreditLog, "id">>;

export type DbSessionInsert = Omit<
  DbSession,
  "id" | "created_at" | "updated_at" | "project_ids"
> &
  Partial<Pick<DbSession, "id" | "project_ids">>;

export type DbMessageInsert = Omit<DbMessage, "id" | "created_at"> &
  Partial<Pick<DbMessage, "id">>;

export type DbUsageLogInsert = Omit<DbUsageLog, "id" | "created_at"> &
  Partial<Pick<DbUsageLog, "id">>;

export type DbModelPricingInsert = Omit<
  DbModelPricing,
  "id" | "updated_at"
> &
  Partial<Pick<DbModelPricing, "id">>;

export type DbPresetInsert = Omit<DbPreset, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbPreset, "id">>;

export type DbUserPresetPreferenceInsert = Omit<
  DbUserPresetPreference,
  "id" | "created_at"
> & Partial<Pick<DbUserPresetPreference, "id">>;

// ---------------------------------------------------------------------------
// Update Types (all fields optional except id)
// ---------------------------------------------------------------------------

export type DbUserUpdate = Partial<Omit<DbUser, "id" | "created_at">>;

export type DbOrganizationUpdate = Partial<
  Omit<DbOrganization, "id" | "created_at">
>;

export type DbTeamUpdate = Partial<Omit<DbTeam, "id" | "created_at">>;

export type DbSessionUpdate = Partial<Omit<DbSession, "id" | "created_at">>;

export type DbPresetUpdate = Partial<Omit<DbPreset, "id" | "created_at">>;

export type DbModelPricingUpdate = Partial<Omit<DbModelPricing, "id">>;

// ---------------------------------------------------------------------------
// Phase 3: Knowledge (RAG)
// ---------------------------------------------------------------------------

export type ProjectMemberRole = "admin" | "member";

export type DocumentSourceType = "text" | "pdf" | "docx" | "url";

export type DocumentStatus = "processing" | "ready" | "error";

export interface DbProject {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DbProjectInsert = Omit<DbProject, "id" | "created_at" | "updated_at"> &
  Partial<Pick<DbProject, "id">>;

export type DbProjectUpdate = Partial<Omit<DbProject, "id" | "created_at">>;

export interface DbProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
}

export interface DbKnowledgeDocument {
  id: string;
  project_id: string;
  title: string;
  source_type: DocumentSourceType;
  source_url: string | null;
  status: DocumentStatus;
  error_message: string | null;
  uploaded_by: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export type DbKnowledgeDocumentInsert = Omit<
  DbKnowledgeDocument,
  "id" | "created_at" | "updated_at" | "chunk_count" | "error_message"
> &
  Partial<Pick<DbKnowledgeDocument, "id">>;

export interface DbDocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: number[] | null;
  created_at: string;
}
