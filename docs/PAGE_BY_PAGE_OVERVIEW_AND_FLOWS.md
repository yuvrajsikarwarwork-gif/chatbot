# Page-By-Page Overview And Flows

Last updated: 2026-03-23

This document describes the current product surface page by page, including:

- what each page is for
- what a user can do on that page
- which backend capabilities it depends on
- how pages connect into larger operational flows

This is intended as a practical product and implementation map for the current platform.

Related docs:

- `docs/PLATFORM_OVERVIEW_AND_GAPS.md`
- `docs/REQUIREMENTS_CHECKLIST.md`
- `docs/campaign-capture-architecture.md`
- `docs/PHASE-15_CONVERSATION_FILE.md`
- `docs/PHASE-16_AGENT_FILE.md`
- `docs/PHASE-17_SETTINGS_FILE.md`

## 1. Navigation Overview

Primary dashboard navigation currently includes:

- `/`
- `/bots`
- `/flows`
- `/leads`
- `/campaigns`
- `/templates`
- `/projects`
- `/platform-accounts`
- `/conversations`
- `/audit`
- `/workspaces`
- `/users`
- `/settings`

Navigation is defined in:

- `frontend-dashboard/components/layout/Sidebar.tsx`

The platform is organized around a few core operating loops:

- authentication and tenant access
- workspace and project setup
- bot and flow setup
- campaign and entry-point setup
- lead capture and segmentation
- conversation handling and assignment
- settings and policy control
- analytics and audit review

## 2. Authentication And Access Pages

### `/login`

Purpose:

- entry point for authenticated dashboard access

Main user actions:

- sign in with credentials
- begin session creation

Primary dependencies:

- auth APIs
- session/token storage

Role in platform flow:

- first step into the dashboard
- required before workspace/project-scoped operations

### `/forgot-password`

Purpose:

- start password reset flow

Main user actions:

- request a reset token or reset link

Primary dependencies:

- auth token / mail flow

### `/reset-password`

Purpose:

- complete password reset with token

Main user actions:

- set a new password

Primary dependencies:

- token validation
- auth update flow

### `/accept-invite`

Purpose:

- accept workspace or tenant invitation

Main user actions:

- validate invitation token
- join a workspace context

Primary dependencies:

- invite and auth token flows

## 3. Landing And Dashboard Pages

### `/`

Purpose:

- primary dashboard landing page

Main user actions:

- get a top-level view of the workspace/project state
- navigate to operational modules

Likely information shown:

- high-level summaries
- shortcuts into core modules

Role in platform flow:

- main command center after login

### `/dashboard`

Purpose:

- alternate or more explicit dashboard summary view

Main user actions:

- review operational summary
- move into bots, campaigns, conversations, analytics, or settings

## 4. Bot And Flow Builder Pages

### `/bots`

Purpose:

- create, edit, and review bots in the current workspace/project context

Main user actions:

- create bot
- edit bot
- select active bot
- inspect bot state and lock conditions

Primary dependencies:

- bot APIs
- workspace/project scoping

Role in platform flow:

- bots anchor runtime identity for flow execution and conversations

### `/flows`

Purpose:

- manage flows available to the current workspace/project

Main user actions:

- list and open flows
- move into visual editing

Primary dependencies:

- flow APIs
- current bot/project context

### `/flow-builder`

Purpose:

- detailed visual flow editing experience

Main user actions:

- design flow nodes and edges
- edit node configuration
- save and version flow logic
- upload media for flow nodes when required

Primary dependencies:

- flow APIs
- upload API
- node definitions and flow editor components

Primary UI components:

- canvas
- node editor
- flow sidebar
- flow toolbar/header

Role in platform flow:

- this is where reusable automation logic is authored
- campaigns later route people into these flows

## 5. Campaign And Lead Pages

### `/campaigns`

Purpose:

- campaign index page for the active workspace/project

Main user actions:

- list campaigns
- create campaign
- delete campaign
- open campaign detail

Primary dependencies:

- campaign list/detail/delete APIs
- project context

Role in platform flow:

- campaigns are the top-level acquisition container

### `/campaign-create`

Purpose:

- create a new campaign in the active project

Main user actions:

- enter campaign basics
- create a campaign record

Role in platform flow:

- initial step before attaching channels, entry points, and lists

### `/campaign-detail`

Purpose:

- manage a specific campaign in depth

Main user actions:

- edit campaign metadata
- create and manage campaign channels
- create and manage entry points
- create and manage campaign lists
- inspect channel, flow, entry-point, and list relationships

Primary dependencies:

- campaign detail API
- campaign channel APIs
- entry point APIs
- list APIs
- platform account references

Role in platform flow:

- main routing configuration page for acquisition architecture
- connects platform accounts and flows to campaign entry paths

### `/leads`

Purpose:

- operational lead review page

Main user actions:

- filter leads by campaign, channel, entry point, flow, list, platform, status, and search
- inspect lead attribution context
- review lead list summaries
- delete leads when permitted

Primary dependencies:

- lead list API
- lead detail and delete APIs
- campaign detail for related filter options

Role in platform flow:

- shows whether campaign routing and lead capture are working correctly
- useful for acquisition, segmentation, and downstream sales/ops handoff

## 6. Conversation And Handoff Pages

### `/conversations`

Purpose:

- central inbox for cross-platform conversation operations

Main layout:

- left panel: conversation list and filters
- center panel: active thread and composer
- right panel: context, assignment, notes, tags, list, and metadata actions

Main user actions:

- filter conversations
- open active threads
- send text reply
- send template reply
- send image reply
- send file/document reply
- use quick replies
- change conversation status
- assign, reassign, or release conversation ownership
- review assignment history
- add notes
- add or remove tags
- change list
- inspect or edit context fields

Primary dependencies:

- conversation APIs
- assignment APIs
- conversation settings APIs
- workspace membership APIs
- platform account APIs
- campaign APIs
- upload API
- real-time dashboard update events

Key UX features currently present:

- unread/new signal
- waiting signal
- message timestamps
- delivery status display when available
- template and interactive rendering
- basic media/document rendering

Role in platform flow:

- this is the main human operations console
- it is where bot-to-agent handoff becomes operationally visible and actionable

### `/agents`

Purpose:

- current and future live-agent operational surface

Main role today:

- companion area for human handoff and future expansion

Current state:

- likely more skeletal than `/conversations`
- supports the direction of human service tooling

### `/tickets`

Purpose:

- support/handoff/ticket style operational view

Role:

- likely adjacent to or complementary with assignment and support workflows

Current state:

- exists in the dashboard surface
- should be treated as part of service-operations tooling

## 7. Template, Queue, And Integration Pages

### `/templates`

Purpose:

- manage reusable outbound templates

Main user actions:

- create and edit templates
- review template structure and approval state
- support bulk upload workflows

Primary dependencies:

- template APIs
- bulk upload modal

Role in platform flow:

- important for WhatsApp outbound re-engagement and structured content reuse

### `/templates/BulkUploadModal`

Purpose:

- modal/subpage-like surface for bulk import workflows

Main user actions:

- upload CSV data
- trigger bulk processing

### `/queue`

Purpose:

- inspect background or processing queue state

Main role:

- operational debugging and processing visibility

Dependencies:

- queue APIs

### `/integrations`

Purpose:

- integration review surface

Current role:

- appears to be increasingly redirected toward platform account management

### `/platform-accounts`

Purpose:

- manage reusable platform accounts inside the active workspace/project

Main user actions:

- create and update platform accounts
- review connected accounts
- manage reusable WhatsApp numbers, page identities, widgets, and related platform credentials

Role in platform flow:

- platform accounts are foundational for campaign channels and outbound reply routing

## 8. Analytics, Audit, And Admin Pages

### `/analytics`

Purpose:

- review telemetry and operational metrics

Main user actions:

- inspect workspace/runtime performance and activity

Dependencies:

- analytics APIs

### `/audit`

Purpose:

- review audit-style events and operational changes

Main user actions:

- inspect sensitive or operationally important events

Dependencies:

- audit/event APIs
- permissions

### `/users`

Purpose:

- platform-level user administration

Visibility:

- typically limited to super admin or developer roles

Main user actions:

- review and manage top-level users

### `/workspaces`

Purpose:

- workspace administration

Main user actions:

- review workspaces
- manage workspace properties
- manage workspace-level operational setup

Role in platform flow:

- tenant administration layer

### `/projects`

Purpose:

- project administration inside a workspace

Main user actions:

- create/manage projects
- review project-specific operational boundaries

Role in platform flow:

- key partitioning layer for bots, campaigns, accounts, and runtime operations

### `/settings`

Purpose:

- workspace-level policy and control center

Main user actions:

- configure conversation settings
- review links into other admin surfaces

Implemented settings behavior:

- auto-assign on/off
- manual reply control
- agent takeover control
- bot resume control
- visibility flags for campaign/flow/list
- default agent
- default campaign
- default list
- allowed platforms
- max open chats

UX state:

- now includes field-level validation feedback

Role in platform flow:

- controls how inbox behavior and assignment policy work across the workspace

## 9. End-To-End Product Flows

### Flow A: New Tenant / New Workspace Setup

Typical path:

1. User logs in
2. User joins or creates workspace
3. User creates or selects project
4. User creates platform accounts
5. User creates bot
6. User creates flows
7. User creates campaign
8. User attaches channels, entry points, and lists
9. User configures settings

Primary pages involved:

- `/login`
- `/workspaces`
- `/projects`
- `/platform-accounts`
- `/bots`
- `/flows`
- `/campaign-create`
- `/campaign-detail`
- `/settings`

### Flow B: Campaign Launch Setup

Typical path:

1. Create campaign
2. Attach channel/platform
3. Attach platform account
4. Create entry point
5. Connect entry point to flow
6. Define list destination
7. Route traffic into campaign entry

Primary pages involved:

- `/campaign-create`
- `/campaign-detail`
- `/platform-accounts`
- `/flows`

Primary backend services involved:

- campaign service
- campaign context service
- flow engine

### Flow C: Lead Capture And Review

Typical path:

1. User arrives via channel and entry point
2. Runtime resolves campaign context
3. Conversation is created or forked with routing context
4. Flow executes
5. Lead form node captures lead
6. Lead is saved to campaign/channel/entry/list bucket
7. Operator reviews leads in dashboard

Primary pages involved:

- `/campaign-detail`
- `/leads`
- `/analytics`

Primary backend services involved:

- flow engine
- campaign context service
- lead capture service

### Flow D: Inbox Operations And Human Handoff

Typical path:

1. Conversation appears in inbox
2. Operator filters by workspace/campaign/platform/account/list/agent
3. Operator reviews thread and context
4. Operator updates status
5. Operator assigns or reassigns conversation
6. Operator replies using text/template/image/file/quick reply
7. Delivery state is tracked
8. Assignment history and notes/tags accumulate over time

Primary pages involved:

- `/conversations`
- `/agents`
- `/tickets`

Primary backend services involved:

- conversation service
- conversation assignment service
- message router
- connector adapters
- webhook controller

### Flow E: Workspace Policy Configuration

Typical path:

1. Admin opens settings
2. Admin configures allowed behavior
3. Validation blocks invalid defaults
4. Conversation and assignment behavior changes at runtime

Primary pages involved:

- `/settings`

Primary backend services involved:

- conversation settings service
- workspace access service
- assignment service
- conversation service

## 10. Backend Capability Map By Route Group

### Auth

- `/api/auth`

Used for:

- login/session/auth operations

### Bots

- `/api/bots`

Used for:

- create/update/list/select bot runtime units

### Flows

- `/api/flows`

Used for:

- flow CRUD and flow-builder persistence

### Campaigns

- `/api/campaigns`

Used for:

- campaigns
- campaign channels
- entry points
- lists

### Leads

- `/api/leads`

Used for:

- lead listing
- lead list summaries
- lead detail
- lead deletion

### Conversations

- `/api/conversations`

Used for:

- conversation list/detail/messages
- reply
- status
- context
- list move
- notes
- tags
- assignment endpoints

### Conversation Settings

- `/api/conversation-settings`

Used for:

- workspace conversation policy retrieval and update

### Templates

- `/api/templates`

Used for:

- template management and selection for outbound sends

### Upload

- `/api/upload`

Used for:

- media/file upload
- CSV upload paths

### Webhook

- `/api/webhook`

Used for:

- WhatsApp inbound traffic
- webhook verification
- WhatsApp delivery status updates

### Platform Accounts

- `/api/platform-accounts`

Used for:

- platform credential/account management

### Projects / Workspaces / Users / Plans / Analytics / Queue

Used for:

- tenant administration
- policy support
- operational reporting
- queue visibility

## 11. Feature Coverage Summary

### Strongly implemented today

- workspace/project model
- campaign architecture
- lead attribution and filtering
- conversation inbox
- assignment and history
- settings and policy controls
- reply validation for current outbound adapters
- delivery tracking foundation

### Partially implemented or still maturing

- advanced assignment balancing
- agent capacity visibility
- broader cross-platform operational verification
- future outbound adapter expansion
- richer delivery lifecycle normalization across all channels

## 12. Known Gaps And Follow-Up Opportunities

Most important remaining work:

1. run broader end-to-end verification across supported channels and real integrations
2. add agent capacity indicators to the inbox
3. expand assignment strategy beyond the current simple auto-assignment logic
4. extend delivery lifecycle support for future adapters
5. continue polishing admin and operator UX around error recovery and visibility

## 13. Bottom Line

The platform now behaves like a real operational product rather than a loose collection of bot features.

It supports:

- acquisition setup
- routing setup
- lead capture
- conversation handling
- human assignment
- policy control
- delivery-aware outbound messaging

The remaining work is concentrated in:

- validation in real environments
- operational excellence
- advanced balancing and observability
- future channel growth

That means the current codebase is already suitable for focused stabilization and rollout planning rather than another major architectural rewrite.
