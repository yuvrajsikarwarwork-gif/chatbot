# Platform Overview And Gaps

Last updated: 2026-03-23

This document summarizes the current state of the chatbot platform across backend, dashboard, runtime, and supporting services. It is intended to answer two questions:

1. What does the platform do today?
2. What is still missing, risky, or only partially complete?

This overview is based on the current repository state and supporting requirement documents:

- `docs/campaign-capture-architecture.md`
- `docs/PHASE-15_CONVERSATION_FILE.md`
- `docs/PHASE-16_AGENT_FILE.md`
- `docs/PHASE-17_SETTINGS_FILE.md`
- `docs/REQUIREMENTS_CHECKLIST.md`

## 1. Platform Summary

The platform is now structured around workspace-scoped, project-scoped chatbot operations with campaign-aware acquisition, lead capture, multi-platform conversations, human assignment, and workspace-level conversation policy controls.

The system is no longer just a single-bot message loop. It now includes:

- workspace and project scoping
- campaign and entry-point routing
- conversation context isolation
- lead attribution and list segmentation
- human handoff and agent assignment
- conversation settings and policy enforcement
- dashboard UX for campaigns, leads, inbox, settings, projects, platform accounts, and workspaces

At the code level, the system is largely feature-complete for the core operating model. The biggest remaining work is live runtime verification and advanced operator-facing improvements rather than missing foundations.

## 2. Main Product Areas

### 2.1 Workspace and Project Model

The platform now assumes that production runtime entities belong to a workspace and usually a project.

Implemented:

- workspace model and membership support
- project model and project access support
- normalized `project_users` membership model with compatibility sync to legacy project-access rows
- workspace permission checks
- normalized permission tables and compatibility-aware runtime permission resolution
- dedicated agent scope storage
- universal audit-log storage foundation
- broader workspace plan-limit enforcement for users, projects, campaigns, integrations, and bots
- support-access gating for platform operators
- project-aware route context resolution
- dashboard pages for workspaces and projects
- dashboard workflows for project member assignment and support-request approval

Primary code areas:

- `backend-api/src/services/workspaceService.ts`
- `backend-api/src/services/workspaceAccessService.ts`
- `backend-api/src/services/projectService.ts`
- `backend-api/src/services/projectAccessService.ts`
- `backend-api/src/middleware/policyMiddleware.ts`
- `frontend-dashboard/pages/workspaces.tsx`
- `frontend-dashboard/pages/projects.tsx`

Current gaps:

- most code paths are wired for workspace and project enforcement, but not every path has been proven in live integration conditions
- platform-wide verification of all permission boundaries is still recommended
- some legacy compatibility role mappings still remain during transition

### 2.2 Campaign-Centric Lead Capture

The acquisition model now follows this hierarchy:

- campaign
- channel
- entry point
- flow
- list
- lead
- conversation

Implemented:

- campaign CRUD
- campaign channel CRUD
- entry point CRUD
- list CRUD
- lead listing and detail flows
- campaign runtime context resolution
- lead capture with campaign, channel, entry point, flow, list, workspace, and bot lineage
- dashboard campaign overview and campaign detail management
- dashboard lead filtering by campaign, channel, entry point, flow, list, platform, status, and search

Primary code areas:

- `backend-api/src/services/campaignService.ts`
- `backend-api/src/services/campaignContextService.ts`
- `backend-api/src/services/leadCaptureService.ts`
- `backend-api/src/models/campaignModel.ts`
- `backend-api/src/models/leadModel.ts`
- `frontend-dashboard/pages/campaigns.tsx`
- `frontend-dashboard/pages/campaign-detail.tsx`
- `frontend-dashboard/pages/leads.tsx`

Current gaps:

- real end-to-end validation across all supported channel/platform permutations is still pending
- some operational assumptions still depend on real account configuration rather than pure local testing

### 2.3 Conversation Inbox

The inbox is now implemented as a workspace-aware, campaign-aware conversation system rather than a generic contact-thread list.

Implemented backend capabilities:

- conversation list endpoint
- conversation detail endpoint
- conversation messages endpoint
- reply endpoint
- status update endpoint
- context update endpoint
- list move endpoint
- notes endpoints
- tags endpoints
- workspace/project/campaign/platform/account/flow/list/agent/date/search filters
- access control based on workspace membership, role, and agent scope
- conversation forking when runtime context changes

Primary backend code areas:

- `backend-api/src/routes/conversationRoutes.ts`
- `backend-api/src/controllers/conversationController.ts`
- `backend-api/src/services/conversationService.ts`
- `backend-api/src/models/conversationModel.ts`

Implemented frontend capabilities:

- three-panel inbox layout
- conversation list
- thread view
- detail panel
- assignment controls
- notes, tags, context editing, list moves
- filter bar for key conversation dimensions
- template send
- text send
- image upload send
- file upload send
- quick replies
- waiting indicator
- unread/new indicator
- thread timestamps
- thread delivery status rendering when stored
- basic rendering for template, interactive/button/list, image, video, audio, and document messages

Primary frontend code areas:

- `frontend-dashboard/pages/conversations.tsx`
- `frontend-dashboard/components/chat/ConversationList.tsx`
- `frontend-dashboard/components/chat/ChatWindow.tsx`
- `frontend-dashboard/components/chat/MessageList.tsx`
- `frontend-dashboard/components/chat/TemplateSelectModal.tsx`

Current gaps:

- deeper delivery-state richness is still limited to what is currently stored and updated
- non-WhatsApp outbound lifecycle tracking is still basic
- true production verification across all supported outbound/inbound platforms is still pending

### 2.4 Assignment and Human Handoff

Human handoff is now implemented with persistent assignment records and current assignee state on conversations.

Implemented:

- assign
- reassign
- release
- assignment history
- current assignee in the inbox list and detail panel
- dedicated inbox capacity indicators per eligible agent
- workspace analytics capacity visibility for agent assignment load and skill signals
- role-aware assignment restrictions
- agent scope restrictions
- normalized workspace role hierarchy in active runtime checks with legacy-role compatibility mapping
- workspace and project compatibility checks for assignees
- auto-assignment using settings
- max-open-chat limit participation in auto-assignment
- balanced auto-assignment using default-agent preference, current load, pending load, least-recent assignment tie-breaking, and skill matching

Primary code areas:

- `backend-api/src/services/conversationAssignmentService.ts`
- `backend-api/src/models/conversationAssignmentModel.ts`
- `frontend-dashboard/pages/conversations.tsx`

Current gaps:

- no dedicated cross-workspace capacity dashboard yet beyond the inbox assignment panel
- no skill-based assignment model yet

### 2.5 Conversation Settings and Policy Controls

Workspace-level conversation controls are implemented and active.

Implemented:

- settings GET and PUT APIs
- settings persistence
- settings page UI
- field-specific frontend validation
- backend validation for:
  - default agent
  - default campaign
  - default list
  - allowed platforms by plan
  - max open chats bounds
- runtime use of settings for:
  - manual reply allowance
  - agent takeover allowance
  - bot resume allowance
  - auto-assignment
  - campaign/flow/list visibility in the inbox

Primary code areas:

- `backend-api/src/services/conversationSettingsService.ts`
- `backend-api/src/models/conversationSettingsModel.ts`
- `frontend-dashboard/pages/settings.tsx`

Current gaps:

- validation is now field-specific, but could still be improved with even more guided remediation hints
- live operator testing across a wider variety of plans/workspace states is still recommended

### 2.7 Support Access And Live Presence

The platform now has backend support foundations for stricter platform-operator privacy and live agent visibility.

Implemented:

- support-access records for workspace-scoped temporary platform-operator access
- backend enforcement so platform operators require active support access for workspace/project access checks
- workspace management UI for granting and revoking temporary support access
- support-request queue with approve/deny flow
- dedicated helpdesk-style support console in `/tickets`
- agent session tracking on login/logout
- per-workspace agent activity tracking
- analytics endpoint and dashboard rendering for live agent presence

Primary code areas:

- `backend-api/src/models/supportAccessModel.ts`
- `backend-api/src/models/agentPresenceModel.ts`
- `backend-api/src/services/agentPresenceService.ts`
- `backend-api/src/services/workspaceAccessService.ts`
- `backend-api/src/routes/workspaceRoutes.ts`
- `backend-api/src/routes/authRoutes.ts`
- `backend-api/src/routes/analyticsRoutes.ts`
- `frontend-dashboard/pages/analytics.tsx`

Current gaps:

- support access now has basic request/approval UX, but not yet a full helpdesk-style console
- presence tracking is foundation-level and does not yet provide full busy/idle/operator consoles

### 2.6 Platform Accounts and Integrations

The codebase now supports reusable platform accounts and project/workspace scoping for them.

Implemented:

- platform account CRUD and management flows
- integration-aware lookup for legacy and newer account models
- WhatsApp credential resolution from channel config, platform account, or legacy integration source

Primary code areas:

- `backend-api/src/services/platformAccountService.ts`
- `backend-api/src/models/platformAccountModel.ts`
- `backend-api/src/services/integrationService.ts`
- `frontend-dashboard/pages/platform-accounts.tsx`

Current gaps:

- outbound adapter coverage is still strongest for WhatsApp, website, and email
- future outbound channels will need their own reply validation and delivery tracking logic

## 3. Supported Runtime Paths Today

### 3.1 WhatsApp

Implemented:

- inbound webhook handling
- campaign context resolution
- conversation creation/forking with campaign context
- outbound text/template/media/document support
- platform-account-aware send path
- delivery metadata persistence
- webhook status update handling

Primary code areas:

- `backend-api/src/controllers/webhookController.ts`
- `backend-api/src/connectors/whatsapp/whatsappAdapter.ts`
- `backend-api/src/services/whatsappService.ts`
- `backend-api/src/services/messageRouter.ts`

Gaps:

- broader production verification still needed
- future extensions may need richer message-type support and additional provider-specific edge-case handling

### 3.2 Website

Implemented:

- web socket registration
- inbound web message flow into the flow engine
- outbound widget message delivery
- conversation inbox support
- synthetic provider ids for outbound website delivery records

Primary code areas:

- `backend-api/src/connectors/website/websiteAdapter.ts`
- `connectors/website/widget.js`

Gaps:

- delivery state is currently optimistic/basic
- behavior should still be exercised in full browser-runtime tests

### 3.3 Email

Implemented:

- outbound email send adapter
- HTML rendering of generic messages/templates
- conversation reply validation for email target shape
- optional platform-account validation for email replies when conversations are bound to an email account

Primary code areas:

- `backend-api/src/connectors/email/emailAdapter.ts`

Gaps:

- no inbound email threading path is evident in the current system
- delivery lifecycle is basic compared to WhatsApp

### 3.4 Telegram and Other Future Channels

Implemented:

- some scaffolding and route placeholders exist

Gaps:

- not complete for end-to-end production use
- reply validation and delivery tracking must be extended when outbound support becomes real

## 4. Current Architecture Strengths

The strongest parts of the current platform are:

- clear workspace and project scoping
- campaign-first acquisition architecture
- conversation context isolation and fork behavior
- functional multi-platform inbox foundation
- robust assignment rules and history
- settings-driven conversation policy control
- improved reply-path validation
- delivery tracking foundation with provider ids and webhook status updates
- dedicated audit-log API and dashboard page backed by `audit_logs`
- green local builds across backend, engine, worker, and frontend dashboard

## 5. Current Gaps By Category

### 5.1 Verification Gaps

These are the most important remaining gaps overall.

- full end-to-end testing across supported platforms is still pending
- real account configuration and webhook callback behavior should be exercised in live or staging conditions
- operator workflow validation across role combinations is still recommended
- the repo now includes a staging verification playbook and webhook-readiness script, but those do not replace real external validation

This is now the biggest residual risk area.

### 5.2 Delivery Lifecycle Gaps

The platform now stores outbound message delivery metadata and updates WhatsApp delivery states from webhook callbacks, but there is still room to mature this layer.

Still missing or partial:

- richer provider-normalized delivery model across all channels
- broader webhook-based lifecycle support for non-WhatsApp channels
- more advanced frontend lifecycle presentation beyond current status rendering

### 5.3 Assignment and Capacity Gaps

Implemented assignment is good enough for core use, but advanced operations are still missing.

Still missing:

- broader operator visibility into capacity outside the inbox assignment panel
- broader operational rollout of skill-based routing

### 5.4 Platform Expansion Gaps

Future outbound channels will require:

- adapter-specific reply validation
- adapter-specific delivery tracking
- end-to-end platform verification

This is a future expansion gap rather than a current core failure.

## 6. Status Against Requirement Phases

### Phase 15 - Conversation System

Status: mostly complete

Complete or effectively complete:

- inbox APIs
- filters
- three-panel UI
- runtime context isolation
- notes/tags/context/list actions
- reply path using conversation context
- platform-account-aware send behavior for supported adapters
- timestamps, waiting/new indicators, thread rendering, attachments
- text/template/image/file/quick-reply composer support

Still open:

- broader real-world runtime verification
- future adapter-specific reply and delivery extensions

### Phase 16 - Agent Assignment

Status: complete for core requirements, partial for advanced operations

Complete:

- assign/reassign/release/history
- visibility rules
- workspace and role enforcement
- auto-assignment
- open-chat limit participation
- dedicated capacity indicators in the inbox
- balancing beyond simple lowest-open-load selection
- skill-aware routing when agent skills are configured

Still open:

- broader capacity dashboards and deeper operational rollout of skill-based routing

### Phase 17 - Conversation Settings

Status: complete for current requirements

Complete:

- storage and APIs
- settings page
- runtime integration
- backend validation
- field-specific frontend validation feedback

Still open:

- further UX refinement only

## 7. Build and Repository Status

Currently verified:

- backend API builds successfully
- bot engine builds successfully
- worker builds successfully
- frontend dashboard builds successfully

This means the repo is in a locally buildable state across the primary application surfaces.

## 8. Most Important Remaining Work

Recommended next priorities:

1. Complete end-to-end runtime verification across supported platforms.
2. Add broader capacity dashboards and future skill-based routing on top of the inbox indicators.
3. Extend delivery lifecycle support as future outbound adapters are added.
4. Continue platform-specific validation and operational hardening as new channels become production-ready.

## 9. Practical Bottom Line

The platform is no longer missing its core architecture. It now has:

- structured tenant scoping
- campaign-aware acquisition and lead capture
- a real inbox
- assignment and history
- settings-driven policy controls
- validated reply paths for supported outbound adapters
- delivery tracking foundation

The platform's main remaining weaknesses are not foundational code gaps. They are:

- runtime verification
- advanced operational visibility
- more sophisticated balancing logic
- future channel expansion work

That is a strong place to be for the next phase of stabilization and rollout.
