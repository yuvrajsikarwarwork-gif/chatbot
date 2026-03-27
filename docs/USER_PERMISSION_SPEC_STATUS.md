# User Permission Spec Status

Last updated: 2026-03-23

This document maps the current codebase against the final user and permission system spec.

## Done

- workspace membership model exists
- project access model exists
- workspace-scoped permission checks exist
- normalized permission tables now exist:
  - `permissions`
  - `role_permissions`
  - `user_permissions`
- exact `project_users` table model now exists alongside legacy sync for compatibility
- dedicated `agent_scope` table now exists and is used as the stored source of truth
- universal `audit_logs` table now exists
- fuller plan-limit enforcement now exists for:
  - users
  - projects
  - campaigns
  - integrations
  - bots
- agent scope filtering exists for projects, campaigns, platforms, and channels
- conversation visibility is filtered by workspace, project, and agent scope
- dynamic platform filters are driven by connected project/workspace platform accounts
- auto-assignment checks scope, load, platform fit, project fit, and skill match
- support-access foundation now exists for platform operators
- platform operators now require active support access before backend workspace/project access checks succeed
- support-access dashboard workflow now exists in workspace management UI with grant and revoke controls
- support-request workflow now exists with:
  - request creation
  - request listing
  - platform-operator approve/deny actions
  - automatic support-access grant on approval
- a helpdesk-style support console now exists on `/tickets` for workspace-scoped request and grant history
- first-class workspace runtime roles now work through the normalized hierarchy:
  - `workspace_admin`
  - `editor`
  - `agent`
  - `viewer`
  while still mapping legacy roles for compatibility
- live agent presence foundation now exists through:
  - `agent_sessions`
  - `agent_activity`
  - login/logout session updates
  - authenticated activity touch updates
  - analytics presence endpoint and dashboard rendering

## Partial

- workspace permissions are now normalized in database tables, but some legacy membership JSON overrides are still supported for backward compatibility during transition
- project access now resolves through `project_users`, while `user_project_access` is still kept in sync for backward compatibility
- audit logging now has a universal table and service foundation, and broader admin/settings/support paths are wired, but not every historical write-path in the product has been migrated into it yet
- support access now has a request/approval flow, but not yet a standalone operator helpdesk console
- support access now has request/approval history UX, but not yet a full cross-workspace operator helpdesk console
- live tracking exists in foundation form, but not yet with a full operator console for busy/idle classification across the whole platform

## Still Missing

- full project-admin/editor/viewer role rollout across every remaining legacy path and migration edge case
- complete super-admin support mode product flow with tickets, approvals, and operator-grade temporary-access history UX
- broader audit-log adoption across every remaining admin and runtime mutation path
- fuller live-tracking console and staffing dashboards beyond the current presence foundation
- real staged channel/webhook verification with live credentials and reachable endpoints

## Practical Bottom Line

The platform now has the core normalized permission and privacy foundations in place: table-driven permissions, dedicated agent scope storage, support-access enforcement, audit-log storage, and quota checks across the main requested entity types. The biggest remaining work for this spec is rollout completeness: full project-role normalization, broader audit adoption, richer support-mode UX, and deeper live-operations visibility.
