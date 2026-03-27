# Final Master System Spec

Last updated: 2026-03-23

This is the unified master spec for the platform. It combines:

- workspace, project, campaign, and bot architecture
- permission and privacy rules
- conversation filtering and platform restrictions
- agent scope and live tracking
- integration filtering
- runtime routing rules
- funnel, tracking, and intelligence gaps
- product gaps and future layers
- corrected operational flow

## Core Architecture And Permission Model

The platform must work in strict layers where workspace is the company container, project is the operational boundary, integrations belong to project, campaigns belong to project, bots belong to project, channels belong to campaign, entry points belong to channel, and conversations, leads, and runtime data must always resolve through `workspace -> project -> integration -> campaign -> channel -> entry point -> flow`. Nothing operational should exist directly under workspace except users, permissions, subscription, and settings.

Super admin must not see any workspace data by default due to privacy rules, and should only see workspace list, users, plans, permissions, logs, and system settings, and can enter a workspace only when the workspace owner gives permission or raises a support request, similar to a ticket system. In support mode super admin may edit workspace settings, change plan, suspend workspace, terminate workspace, reset configuration, or send reminders and notifications, but cannot create projects, edit bots, edit campaigns, edit flows, edit integrations, or access conversations unless temporary access is granted.

Workspace admin is the owner of the workspace and can control everything inside the workspace including projects, integrations, bots, campaigns, users, flows, conversations, leads, and permissions, but cannot access other workspaces and cannot exceed limits defined by subscription plan such as number of users, projects, campaigns, integrations, bots, or active conversations.

Project admin controls only one project and can manage integrations, bots, campaigns, flows, entry points, leads, and conversations of that project, and may create basic users for the project but cannot manage workspace settings or other projects.

Editors are operational users who can create and edit campaigns, bots, flows, entry points, and leads inside assigned projects but cannot delete workspace, change permissions, or change subscription.

Agents are runtime users who handle conversations and leads, and must only see conversations from assigned projects, assigned campaigns, and allowed platforms, and platform filters in the inbox must be dynamic so only platforms that have integrations connected in the selected project are visible.

Viewer role is read-only and can only see dashboards, analytics, leads, and reports.

Permission system must use tick-based controls where actions like edit workflow, delete campaign, add integration, manage users, view leads, export data, or assign conversations can be enabled or disabled per role, and all queries must be filtered by `workspace_id`, `project_id`, `campaign_id`, `integration_id`, and `channel_id` before returning data to prevent cross-project leaks.

## Conversation Runtime And Scope Rules

Conversation runtime must always resolve routing context before creating or reusing a conversation, meaning incoming messages must be matched using platform account, integration, project, campaign channel, and entry point, and a conversation should only be reused if all routing dimensions match, otherwise a new conversation must be created.

Agent inbox must enforce scope rules so agents only see conversations they are assigned to or allowed to take over, and auto-assignment must choose agents who belong to the same project, have permission for that platform, and have not exceeded max open chats.

Conversation filters must include project, campaign, platform, integration, agent, status, and date, and platform list must be generated dynamically from existing integrations of the selected project.

Live tracking must store agent sessions, login time, last activity, active chats, idle time, and assignment history so workspace admin can see real-time dashboard of online agents, total live users, active conversations, leads today, campaign activity, and agent performance.

All conversations, leads, and messages must store full lineage including `workspace_id`, `project_id`, `campaign_id`, `channel_id`, `integration_id`, `platform_account_id`, `flow_id`, and `bot_id` to support filtering, analytics, and attribution.

## Product Layers And Future Value

On product level, the system must also include funnel visibility, lead intelligence, event-based automation, campaign analytics, AI assistance, and integration ecosystem, because without these layers the platform remains a tool instead of a growth product.

Funnel tracking must support `impression -> click -> chat -> lead -> conversion -> revenue attribution`.

Lead intelligence must support scoring, tagging, segmentation, and behavior tracking.

Automation must support triggers like no reply, new lead, tag added, inactivity, or campaign event.

Campaigns must support A/B testing and performance comparison.

Inbox must show customer timeline and campaign attribution.

Integrations must support external systems like CRM, ecommerce, payments, and webhooks.

Analytics must show actionable insights instead of raw data.

Onboarding must guide user to create first campaign quickly.

Permissions must support fine-grained control and audit logs.

Templates must exist for flows and campaigns.

UX must stay simple so non-technical users can operate the system.

Without these layers the platform has infrastructure but not product value, so future development must prioritize funnel tracking, trigger automation, lead intelligence, campaign optimization, AI assistance, and simplified user experience before adding more features.
