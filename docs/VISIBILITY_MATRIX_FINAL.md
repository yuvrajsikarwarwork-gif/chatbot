# Visibility Matrix Final

Last updated: 2026-03-23

This document defines what each role should see in sidebar, pages, and data scope.

It is based on:

- workspace -> project architecture
- project isolation
- platform filtering
- agent scope
- super admin privacy
- plan limits
- tick permissions
- conversation restrictions
- live tracking

This is a visibility map, not just a permission list.

## 1. Super Admin

Super admin is a platform operator only, not a workspace user.

Sidebar visible:

- Workspaces
- Workspace Users
- Plans / Subscription
- Permissions / Roles
- Support / Tickets
- System Settings
- Audit Logs
- Notifications

Sidebar not visible:

- Projects
- Campaigns
- Bots
- Flows
- Integrations
- Conversations
- Leads
- Inbox
- Analytics (workspace)
- Entry points

Can open workspace only with support access.

Can see inside workspace in support mode only:

- Workspace settings
- Users
- Permissions
- Subscription
- Logs

Not allowed:

- Edit bot
- Edit flow
- Edit campaign
- Read conversations unless explicitly allowed

## 2. Workspace Admin

Workspace owner.

Sidebar visible:

- Dashboard
- Projects
- Campaigns
- Bots
- Flows
- Integrations
- Conversations / Inbox
- Leads
- Analytics
- Users
- Permissions
- Settings
- Live Tracking
- Billing / Plan

Can see:

- All projects
- All campaigns
- All bots
- All integrations
- All conversations
- All leads
- All users
- All analytics

Limited by plan:

- Hide create buttons if the limit is reached
- Example: max projects reached -> hide create project
- Example: max users reached -> disable invite

## 3. Project Admin

Project owner only.

Sidebar visible:

- Dashboard
- Projects (only assigned)
- Campaigns
- Bots
- Flows
- Integrations
- Inbox
- Leads
- Analytics
- Entry Points

Sidebar hidden:

- Billing
- Workspace settings
- Plan
- All users (only project users)

Can see:

- Only assigned project
- Only integrations of project
- Only campaigns of project
- Only bots of project
- Only leads of project
- Only conversations of project

Platform filter must use project integrations.

## 4. Editor

Operations user.

Sidebar visible:

- Campaigns
- Bots
- Flows
- Inbox
- Leads
- Entry Points
- Integrations (read or edit based on permission)
- Analytics (optional)

Sidebar hidden:

- Workspace settings
- Billing
- Permissions
- Users
- Plan

Can see:

- Assigned projects
- Assigned campaigns
- Assigned bots
- Assigned integrations
- Assigned conversations

Can do:

- Edit flow
- Edit bot
- Create campaign
- Edit campaign
- Create entry point

Only if the required tick permission is enabled.

## 5. Agent

Chat / lead handler.

Sidebar visible:

- Inbox
- Leads
- My Conversations
- My Campaigns
- Live Status (optional)

Sidebar hidden:

- Projects
- Bots
- Flows
- Integrations
- Settings
- Permissions
- Billing

Can see:

- Assigned conversations
- Allowed campaigns
- Allowed projects
- Allowed platforms
- Assigned leads

Platform list must be filtered dynamically.

If the project has:

- WhatsApp
- Website

The agent filter must show only:

- WhatsApp
- Website

Not:

- Instagram
- Email

Scope table:

```text
agent_scope
  user_id
  project_id
  campaign_id
  platform
```

## 6. Viewer

Read only.

Sidebar visible:

- Dashboard
- Analytics
- Leads (read only)
- Reports

Sidebar hidden:

- Inbox
- Bots
- Flows
- Integrations
- Permissions
- Settings
- Billing

Can see:

- Campaign stats
- Lead list
- Reports
- Analytics

Cannot edit.

## Page-Level Visibility

### Projects Page

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes, all |
| ProjectAdmin | Yes, assigned |
| Editor | Yes, assigned |
| Agent | No |
| Viewer | No |

### Integrations Page

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes |
| ProjectAdmin | Yes, project only |
| Editor | Yes, if allowed |
| Agent | No |
| Viewer | No |

Must filter by project.

### Campaign Page

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes |
| ProjectAdmin | Yes, project only |
| Editor | Yes, assigned |
| Agent | Read only |
| Viewer | Read only |

### Bot / Flow Builder

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes |
| ProjectAdmin | Yes |
| Editor | Yes |
| Agent | No |
| Viewer | No |

### Conversation / Inbox

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes, all |
| ProjectAdmin | Project only |
| Editor | Project only |
| Agent | Scoped only |
| Viewer | Optional |

Filter must include:

- workspace
- project
- campaign
- platform
- integration
- agent scope

### Leads Page

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | All |
| ProjectAdmin | Project only |
| Editor | Assigned |
| Agent | Assigned |
| Viewer | Read only |

### Users / Permission Page

| Role | Visible |
| --- | --- |
| SuperAdmin | Platform only |
| WorkspaceAdmin | Workspace |
| ProjectAdmin | Project users |
| Editor | No |
| Agent | No |
| Viewer | No |

### Live Tracking Page

| Role | Visible |
| --- | --- |
| SuperAdmin | No |
| WorkspaceAdmin | Yes |
| ProjectAdmin | Project only |
| Editor | Optional |
| Agent | Own status |
| Viewer | Optional |

Shows:

- online agents
- active chats
- idle agents
- campaign load

## Final Visibility Rule

```text
SuperAdmin -> platform only

WorkspaceAdmin -> full workspace

ProjectAdmin -> project only

Editor -> assigned project

Agent -> assigned scope

Viewer -> read only
```

All data must filter by:

```text
workspace_id
project_id
campaign_id
integration_id
platform
agent_scope
```

This keeps the system safe.
