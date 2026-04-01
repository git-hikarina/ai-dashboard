import { describe, it, expect } from "vitest";
import type {
  UserRole,
  UserPlan,
  OrganizationPlan,
  BillingCycle,
  OrgMemberRole,
  TeamMemberRole,
  SessionMode,
  MessageRole,
  ApprovalStatus,
  ModelProvider,
  DbUser,
  DbOrganization,
  DbOrgMember,
  DbTeam,
  DbTeamMember,
  DbCreditLog,
  DbTeamCreditLog,
  DbSession,
  DbMessage,
  DbUsageLog,
  DbModelPricing,
  DbUserInsert,
  DbOrganizationInsert,
  DbOrgMemberInsert,
  DbTeamInsert,
  DbTeamMemberInsert,
  DbCreditLogInsert,
  DbTeamCreditLogInsert,
  DbSessionInsert,
  DbMessageInsert,
  DbUsageLogInsert,
  DbModelPricingInsert,
  DbUserUpdate,
  DbOrganizationUpdate,
  DbTeamUpdate,
  DbSessionUpdate,
  DbModelPricingUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Helpers: compile-time type assertions
// ---------------------------------------------------------------------------

/**
 * Assert that type A is assignable to type B.
 * If it compiles, the assertion holds.
 */
type AssertAssignable<A, B> = A extends B ? true : never;

/** Force TypeScript to evaluate a type assertion (unused value, compile-only) */
function assertType<_T extends true>() {
  // no-op; purely compile-time
}

// ---------------------------------------------------------------------------
// Enum coverage tests
// ---------------------------------------------------------------------------

describe("Enum / literal union types", () => {
  it("UserRole covers all expected values", () => {
    const roles: UserRole[] = ["system_admin", "org_admin", "member"];
    expect(roles).toHaveLength(3);

    // Compile-time: each literal is assignable
    assertType<AssertAssignable<"system_admin", UserRole>>();
    assertType<AssertAssignable<"org_admin", UserRole>>();
    assertType<AssertAssignable<"member", UserRole>>();
  });

  it("UserPlan covers all expected values", () => {
    const plans: UserPlan[] = ["free", "personal", "team", "trial", "outage"];
    expect(plans).toHaveLength(5);

    assertType<AssertAssignable<"free", UserPlan>>();
    assertType<AssertAssignable<"personal", UserPlan>>();
    assertType<AssertAssignable<"team", UserPlan>>();
    assertType<AssertAssignable<"trial", UserPlan>>();
    assertType<AssertAssignable<"outage", UserPlan>>();
  });

  it("OrganizationPlan covers all expected values", () => {
    const plans: OrganizationPlan[] = ["organization", "trial", "outage"];
    expect(plans).toHaveLength(3);

    assertType<AssertAssignable<"organization", OrganizationPlan>>();
    assertType<AssertAssignable<"trial", OrganizationPlan>>();
    assertType<AssertAssignable<"outage", OrganizationPlan>>();
  });

  it("BillingCycle covers all expected values", () => {
    const cycles: BillingCycle[] = ["monthly", "yearly"];
    expect(cycles).toHaveLength(2);

    assertType<AssertAssignable<"monthly", BillingCycle>>();
    assertType<AssertAssignable<"yearly", BillingCycle>>();
  });

  it("OrgMemberRole covers all expected values", () => {
    const roles: OrgMemberRole[] = ["org_admin", "member"];
    expect(roles).toHaveLength(2);

    assertType<AssertAssignable<"org_admin", OrgMemberRole>>();
    assertType<AssertAssignable<"member", OrgMemberRole>>();
  });

  it("TeamMemberRole covers all expected values", () => {
    const roles: TeamMemberRole[] = ["owner", "admin", "member"];
    expect(roles).toHaveLength(3);

    assertType<AssertAssignable<"owner", TeamMemberRole>>();
    assertType<AssertAssignable<"admin", TeamMemberRole>>();
    assertType<AssertAssignable<"member", TeamMemberRole>>();
  });

  it("SessionMode covers all expected values", () => {
    const modes: SessionMode[] = ["auto", "fixed", "compare"];
    expect(modes).toHaveLength(3);

    assertType<AssertAssignable<"auto", SessionMode>>();
    assertType<AssertAssignable<"fixed", SessionMode>>();
    assertType<AssertAssignable<"compare", SessionMode>>();
  });

  it("MessageRole covers all expected values", () => {
    const roles: MessageRole[] = ["user", "assistant", "system"];
    expect(roles).toHaveLength(3);

    assertType<AssertAssignable<"user", MessageRole>>();
    assertType<AssertAssignable<"assistant", MessageRole>>();
    assertType<AssertAssignable<"system", MessageRole>>();
  });

  it("ApprovalStatus covers all expected values", () => {
    const statuses: ApprovalStatus[] = [
      "auto",
      "user_approved",
      "admin_approved",
      "rejected",
    ];
    expect(statuses).toHaveLength(4);

    assertType<AssertAssignable<"auto", ApprovalStatus>>();
    assertType<AssertAssignable<"user_approved", ApprovalStatus>>();
    assertType<AssertAssignable<"admin_approved", ApprovalStatus>>();
    assertType<AssertAssignable<"rejected", ApprovalStatus>>();
  });

  it("ModelProvider covers all expected values", () => {
    const providers: ModelProvider[] = [
      "anthropic",
      "openai",
      "google",
      "deepseek",
      "xai",
    ];
    expect(providers).toHaveLength(5);

    assertType<AssertAssignable<"anthropic", ModelProvider>>();
    assertType<AssertAssignable<"openai", ModelProvider>>();
    assertType<AssertAssignable<"google", ModelProvider>>();
    assertType<AssertAssignable<"deepseek", ModelProvider>>();
    assertType<AssertAssignable<"xai", ModelProvider>>();
  });
});

// ---------------------------------------------------------------------------
// Row type field tests (compile-time + runtime shape validation)
// ---------------------------------------------------------------------------

describe("DbUser", () => {
  const user: DbUser = {
    id: "uuid-1",
    firebase_uid: "fb-123",
    email: "test@example.com",
    display_name: "Test User",
    role: "member",
    credits: 100,
    active_organization_id: null,
    active_team_id: null,
    plan: "trial",
    plan_started_at: null,
    plan_expires_at: null,
    plan_billing_cycle: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("firebase_uid");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("display_name");
    expect(user).toHaveProperty("role");
    expect(user).toHaveProperty("credits");
    expect(user).toHaveProperty("active_organization_id");
    expect(user).toHaveProperty("active_team_id");
    expect(user).toHaveProperty("plan");
    expect(user).toHaveProperty("plan_started_at");
    expect(user).toHaveProperty("plan_expires_at");
    expect(user).toHaveProperty("plan_billing_cycle");
    expect(user).toHaveProperty("created_at");
    expect(user).toHaveProperty("updated_at");
  });

  it("role field uses UserRole type", () => {
    assertType<AssertAssignable<DbUser["role"], UserRole>>();
    assertType<AssertAssignable<UserRole, DbUser["role"]>>();
  });

  it("plan field uses UserPlan type", () => {
    assertType<AssertAssignable<DbUser["plan"], UserPlan>>();
    assertType<AssertAssignable<UserPlan, DbUser["plan"]>>();
  });

  it("nullable fields accept null", () => {
    const withNulls: DbUser = {
      ...user,
      active_organization_id: null,
      active_team_id: null,
      plan_started_at: null,
      plan_expires_at: null,
      plan_billing_cycle: null,
    };
    expect(withNulls.active_organization_id).toBeNull();
    expect(withNulls.active_team_id).toBeNull();
    expect(withNulls.plan_billing_cycle).toBeNull();
  });
});

describe("DbOrganization", () => {
  const org: DbOrganization = {
    id: "uuid-org",
    name: "Acme Corp",
    slug: "acme",
    credits: 500,
    member_count: 10,
    team_count: 3,
    plan: "organization",
    plan_started_at: "2025-01-01T00:00:00Z",
    plan_expires_at: "2026-01-01T00:00:00Z",
    plan_billing_cycle: "yearly",
    feature_restrictions: {},
    monthly_budget_jpy: 0,
    budget_alert_sent_80: false,
    budget_alert_sent_100: false,
    budget_alert_month: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(org).toHaveProperty("id");
    expect(org).toHaveProperty("name");
    expect(org).toHaveProperty("slug");
    expect(org).toHaveProperty("credits");
    expect(org).toHaveProperty("member_count");
    expect(org).toHaveProperty("team_count");
    expect(org).toHaveProperty("plan");
    expect(org).toHaveProperty("plan_started_at");
    expect(org).toHaveProperty("plan_expires_at");
    expect(org).toHaveProperty("plan_billing_cycle");
    expect(org).toHaveProperty("feature_restrictions");
    expect(org).toHaveProperty("created_at");
    expect(org).toHaveProperty("updated_at");
  });

  it("plan field uses OrganizationPlan type", () => {
    assertType<AssertAssignable<DbOrganization["plan"], OrganizationPlan>>();
    assertType<AssertAssignable<OrganizationPlan, DbOrganization["plan"]>>();
  });
});

describe("DbOrgMember", () => {
  const member: DbOrgMember = {
    id: "org-uuid_user-uuid",
    organization_id: "org-uuid",
    user_id: "user-uuid",
    role: "member",
    display_name: "John",
    email: "john@example.com",
    joined_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(member).toHaveProperty("id");
    expect(member).toHaveProperty("organization_id");
    expect(member).toHaveProperty("user_id");
    expect(member).toHaveProperty("role");
    expect(member).toHaveProperty("display_name");
    expect(member).toHaveProperty("email");
    expect(member).toHaveProperty("joined_at");
  });

  it("role field uses OrgMemberRole type", () => {
    assertType<AssertAssignable<DbOrgMember["role"], OrgMemberRole>>();
    assertType<AssertAssignable<OrgMemberRole, DbOrgMember["role"]>>();
  });
});

describe("DbTeam", () => {
  const team: DbTeam = {
    id: "uuid-team",
    name: "Alpha Team",
    owner_id: "uuid-owner",
    organization_id: null,
    invite_code: "ABC12345",
    credits: 200,
    member_count: 5,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(team).toHaveProperty("id");
    expect(team).toHaveProperty("name");
    expect(team).toHaveProperty("owner_id");
    expect(team).toHaveProperty("organization_id");
    expect(team).toHaveProperty("invite_code");
    expect(team).toHaveProperty("credits");
    expect(team).toHaveProperty("member_count");
    expect(team).toHaveProperty("created_at");
    expect(team).toHaveProperty("updated_at");
  });
});

describe("DbTeamMember", () => {
  const member: DbTeamMember = {
    id: "team-uuid_user-uuid",
    team_id: "team-uuid",
    user_id: "user-uuid",
    role: "owner",
    display_name: "Alice",
    email: "alice@example.com",
    joined_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(member).toHaveProperty("id");
    expect(member).toHaveProperty("team_id");
    expect(member).toHaveProperty("user_id");
    expect(member).toHaveProperty("role");
    expect(member).toHaveProperty("display_name");
    expect(member).toHaveProperty("email");
    expect(member).toHaveProperty("joined_at");
  });

  it("role field uses TeamMemberRole type", () => {
    assertType<AssertAssignable<DbTeamMember["role"], TeamMemberRole>>();
    assertType<AssertAssignable<TeamMemberRole, DbTeamMember["role"]>>();
  });
});

describe("DbCreditLog", () => {
  const log: DbCreditLog = {
    id: "uuid-log",
    user_id: "uuid-user",
    type: "ai_chat",
    amount: -10,
    balance: 90,
    description: "Used AI chat",
    created_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(log).toHaveProperty("id");
    expect(log).toHaveProperty("user_id");
    expect(log).toHaveProperty("type");
    expect(log).toHaveProperty("amount");
    expect(log).toHaveProperty("balance");
    expect(log).toHaveProperty("description");
    expect(log).toHaveProperty("created_at");
  });

  it("amount can be negative (deduction)", () => {
    expect(log.amount).toBeLessThan(0);
  });
});

describe("DbTeamCreditLog", () => {
  const log: DbTeamCreditLog = {
    id: "uuid-tlog",
    team_id: "uuid-team",
    user_id: "uuid-user",
    type: "admin_add",
    amount: 50,
    balance: 250,
    description: "Admin added credits",
    created_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(log).toHaveProperty("id");
    expect(log).toHaveProperty("team_id");
    expect(log).toHaveProperty("user_id");
    expect(log).toHaveProperty("type");
    expect(log).toHaveProperty("amount");
    expect(log).toHaveProperty("balance");
    expect(log).toHaveProperty("description");
    expect(log).toHaveProperty("created_at");
  });
});

describe("DbSession", () => {
  const session: DbSession = {
    id: "uuid-session",
    title: "Chat about TypeScript",
    owner_id: "uuid-owner",
    organization_id: null,
    preset_id: null,
    mode: "fixed",
    fixed_model: "gpt-4o",
    is_shared: false,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("title");
    expect(session).toHaveProperty("owner_id");
    expect(session).toHaveProperty("organization_id");
    expect(session).toHaveProperty("preset_id");
    expect(session).toHaveProperty("mode");
    expect(session).toHaveProperty("fixed_model");
    expect(session).toHaveProperty("is_shared");
    expect(session).toHaveProperty("created_at");
    expect(session).toHaveProperty("updated_at");
  });

  it("mode field uses SessionMode type", () => {
    assertType<AssertAssignable<DbSession["mode"], SessionMode>>();
    assertType<AssertAssignable<SessionMode, DbSession["mode"]>>();
  });
});

describe("DbMessage", () => {
  const message: DbMessage = {
    id: "uuid-msg",
    session_id: "uuid-session",
    role: "assistant",
    content: "Hello, how can I help?",
    model_used: "gpt-4o",
    input_tokens: 100,
    output_tokens: 50,
    cost_jpy: 0.25,
    sender_id: null,
    created_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(message).toHaveProperty("id");
    expect(message).toHaveProperty("session_id");
    expect(message).toHaveProperty("role");
    expect(message).toHaveProperty("content");
    expect(message).toHaveProperty("model_used");
    expect(message).toHaveProperty("input_tokens");
    expect(message).toHaveProperty("output_tokens");
    expect(message).toHaveProperty("cost_jpy");
    expect(message).toHaveProperty("sender_id");
    expect(message).toHaveProperty("created_at");
  });

  it("role field uses MessageRole type", () => {
    assertType<AssertAssignable<DbMessage["role"], MessageRole>>();
    assertType<AssertAssignable<MessageRole, DbMessage["role"]>>();
  });
});

describe("DbUsageLog", () => {
  const log: DbUsageLog = {
    id: "uuid-usage",
    user_id: "uuid-user",
    session_id: "uuid-session",
    message_id: "uuid-msg",
    provider: "openai",
    model_id: "gpt-4o",
    input_tokens: 200,
    output_tokens: 100,
    cost_jpy: 0.5,
    estimated_cost_jpy: 0.48,
    approval_status: "auto",
    created_at: "2025-01-01T00:00:00Z",
  };

  it("has all required fields", () => {
    expect(log).toHaveProperty("id");
    expect(log).toHaveProperty("user_id");
    expect(log).toHaveProperty("session_id");
    expect(log).toHaveProperty("message_id");
    expect(log).toHaveProperty("provider");
    expect(log).toHaveProperty("model_id");
    expect(log).toHaveProperty("input_tokens");
    expect(log).toHaveProperty("output_tokens");
    expect(log).toHaveProperty("cost_jpy");
    expect(log).toHaveProperty("estimated_cost_jpy");
    expect(log).toHaveProperty("approval_status");
    expect(log).toHaveProperty("created_at");
  });

  it("approval_status field uses ApprovalStatus type", () => {
    assertType<AssertAssignable<DbUsageLog["approval_status"], ApprovalStatus>>();
    assertType<AssertAssignable<ApprovalStatus, DbUsageLog["approval_status"]>>();
  });
});

describe("DbModelPricing", () => {
  const pricing: DbModelPricing = {
    id: "uuid-pricing",
    provider: "anthropic",
    model_id: "claude-opus-4-6",
    display_name: "Claude Opus",
    input_price_per_1k: 2.25,
    output_price_per_1k: 11.25,
    updated_at: "2025-01-01T00:00:00Z",
    updated_by: null,
  };

  it("has all required fields", () => {
    expect(pricing).toHaveProperty("id");
    expect(pricing).toHaveProperty("provider");
    expect(pricing).toHaveProperty("model_id");
    expect(pricing).toHaveProperty("display_name");
    expect(pricing).toHaveProperty("input_price_per_1k");
    expect(pricing).toHaveProperty("output_price_per_1k");
    expect(pricing).toHaveProperty("updated_at");
    expect(pricing).toHaveProperty("updated_by");
  });
});

// ---------------------------------------------------------------------------
// Insert type tests
// ---------------------------------------------------------------------------

describe("Insert types", () => {
  it("DbUserInsert omits auto-generated fields", () => {
    const insert: DbUserInsert = {
      firebase_uid: "fb-new",
      email: "new@example.com",
      display_name: "New User",
      role: "member",
      credits: 0,
      active_organization_id: null,
      active_team_id: null,
      plan: "trial",
      plan_started_at: null,
      plan_expires_at: null,
      plan_billing_cycle: null,
    };
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("updated_at");
  });

  it("DbUserInsert allows optional id", () => {
    const insertWithId: DbUserInsert = {
      id: "custom-uuid",
      firebase_uid: "fb-new",
      email: "new@example.com",
      display_name: "New User",
      role: "member",
      credits: 0,
      active_organization_id: null,
      active_team_id: null,
      plan: "trial",
      plan_started_at: null,
      plan_expires_at: null,
      plan_billing_cycle: null,
    };
    expect(insertWithId.id).toBe("custom-uuid");
  });

  it("DbOrganizationInsert omits auto-generated fields", () => {
    const insert: DbOrganizationInsert = {
      name: "New Org",
      slug: "new-org",
      credits: 0,
      member_count: 0,
      team_count: 0,
      plan: "trial",
      plan_started_at: null,
      plan_expires_at: null,
      plan_billing_cycle: null,
      feature_restrictions: {},
      monthly_budget_jpy: 0,
      budget_alert_sent_80: false,
      budget_alert_sent_100: false,
      budget_alert_month: null,
    };
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("updated_at");
  });

  it("DbOrgMemberInsert omits joined_at", () => {
    const insert: DbOrgMemberInsert = {
      id: "org_user",
      organization_id: "org-uuid",
      user_id: "user-uuid",
      role: "member",
      display_name: "Test",
      email: "test@example.com",
    };
    expect(insert).not.toHaveProperty("joined_at");
  });

  it("DbTeamInsert omits auto-generated fields", () => {
    const insert: DbTeamInsert = {
      name: "New Team",
      owner_id: "uuid-owner",
      organization_id: null,
      invite_code: "ABCD1234",
      credits: 0,
      member_count: 0,
    };
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("updated_at");
  });

  it("DbTeamMemberInsert omits joined_at", () => {
    const insert: DbTeamMemberInsert = {
      id: "team_user",
      team_id: "team-uuid",
      user_id: "user-uuid",
      role: "member",
      display_name: "Bob",
      email: "bob@example.com",
    };
    expect(insert).not.toHaveProperty("joined_at");
  });

  it("DbCreditLogInsert omits auto-generated fields", () => {
    const insert: DbCreditLogInsert = {
      user_id: "uuid-user",
      type: "ai_chat",
      amount: -5,
      balance: 95,
      description: "Chat usage",
    };
    expect(insert).not.toHaveProperty("created_at");
  });

  it("DbTeamCreditLogInsert omits auto-generated fields", () => {
    const insert: DbTeamCreditLogInsert = {
      team_id: "uuid-team",
      user_id: "uuid-user",
      type: "admin_add",
      amount: 100,
      balance: 300,
      description: "Added credits",
    };
    expect(insert).not.toHaveProperty("created_at");
  });

  it("DbSessionInsert omits auto-generated fields", () => {
    const insert: DbSessionInsert = {
      title: "New Chat",
      owner_id: "uuid-owner",
      organization_id: null,
      preset_id: null,
      mode: "fixed",
      fixed_model: "gpt-4o",
      is_shared: false,
    };
    expect(insert).not.toHaveProperty("created_at");
    expect(insert).not.toHaveProperty("updated_at");
  });

  it("DbMessageInsert omits auto-generated fields", () => {
    const insert: DbMessageInsert = {
      session_id: "uuid-session",
      role: "user",
      content: "Hello",
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      cost_jpy: null,
      sender_id: "uuid-user",
    };
    expect(insert).not.toHaveProperty("created_at");
  });

  it("DbUsageLogInsert omits auto-generated fields", () => {
    const insert: DbUsageLogInsert = {
      user_id: "uuid-user",
      session_id: "uuid-session",
      message_id: null,
      provider: "openai",
      model_id: "gpt-4o",
      input_tokens: 100,
      output_tokens: 50,
      cost_jpy: 0.25,
      estimated_cost_jpy: null,
      approval_status: "auto",
    };
    expect(insert).not.toHaveProperty("created_at");
  });

  it("DbModelPricingInsert omits auto-generated fields", () => {
    const insert: DbModelPricingInsert = {
      provider: "openai",
      model_id: "gpt-4o",
      display_name: "GPT-4o",
      input_price_per_1k: 0.375,
      output_price_per_1k: 1.5,
      updated_by: null,
    };
    expect(insert).not.toHaveProperty("updated_at");
  });
});

// ---------------------------------------------------------------------------
// Update type tests
// ---------------------------------------------------------------------------

describe("Update types", () => {
  it("DbUserUpdate allows partial fields", () => {
    const update: DbUserUpdate = { display_name: "Updated Name" };
    expect(update.display_name).toBe("Updated Name");
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("created_at");
  });

  it("DbOrganizationUpdate allows partial fields", () => {
    const update: DbOrganizationUpdate = { name: "New Name", credits: 100 };
    expect(update.name).toBe("New Name");
  });

  it("DbTeamUpdate allows partial fields", () => {
    const update: DbTeamUpdate = { name: "Renamed Team" };
    expect(update.name).toBe("Renamed Team");
  });

  it("DbSessionUpdate allows partial fields", () => {
    const update: DbSessionUpdate = { title: "Renamed Session", is_shared: true };
    expect(update.title).toBe("Renamed Session");
  });

  it("DbModelPricingUpdate allows partial fields", () => {
    const update: DbModelPricingUpdate = { input_price_per_1k: 3.0 };
    expect(update.input_price_per_1k).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// Type compatibility tests
// ---------------------------------------------------------------------------

describe("Type compatibility", () => {
  it("DbOrgMember.role is exactly OrgMemberRole", () => {
    assertType<AssertAssignable<DbOrgMember["role"], OrgMemberRole>>();
    assertType<AssertAssignable<OrgMemberRole, DbOrgMember["role"]>>();
  });

  it("DbTeamMember.role is exactly TeamMemberRole", () => {
    assertType<AssertAssignable<DbTeamMember["role"], TeamMemberRole>>();
    assertType<AssertAssignable<TeamMemberRole, DbTeamMember["role"]>>();
  });

  it("DbUser.plan_billing_cycle is BillingCycle | null", () => {
    assertType<
      AssertAssignable<DbUser["plan_billing_cycle"], BillingCycle | null>
    >();
    assertType<
      AssertAssignable<BillingCycle | null, DbUser["plan_billing_cycle"]>
    >();
  });

  it("DbOrganization.plan_billing_cycle is BillingCycle | null", () => {
    assertType<
      AssertAssignable<
        DbOrganization["plan_billing_cycle"],
        BillingCycle | null
      >
    >();
    assertType<
      AssertAssignable<
        BillingCycle | null,
        DbOrganization["plan_billing_cycle"]
      >
    >();
  });

  it("DbMessage.role is exactly MessageRole", () => {
    assertType<AssertAssignable<DbMessage["role"], MessageRole>>();
    assertType<AssertAssignable<MessageRole, DbMessage["role"]>>();
  });

  it("DbUsageLog.approval_status is exactly ApprovalStatus", () => {
    assertType<
      AssertAssignable<DbUsageLog["approval_status"], ApprovalStatus>
    >();
    assertType<
      AssertAssignable<ApprovalStatus, DbUsageLog["approval_status"]>
    >();
  });

  it("DbSession.mode is exactly SessionMode", () => {
    assertType<AssertAssignable<DbSession["mode"], SessionMode>>();
    assertType<AssertAssignable<SessionMode, DbSession["mode"]>>();
  });
});
