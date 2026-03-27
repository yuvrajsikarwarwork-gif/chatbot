# Permission, Visibility, and Alignment Audit

Last updated: 2026-03-23

## Purpose

This document answers four practical questions:

1. What permission and visibility structures exist today?
2. Is the permission board implemented or not?
3. Is backend enforcement aligned with frontend visibility?
4. Is database structure aligned with backend and frontend usage?

This review is based on the current codebase only. It is a code audit, not a staged runtime verification.

## Executive Summary

### Overall status

- Database permission foundation: implemented
- Backend permission enforcement: implemented with some gaps
- Frontend visibility and access gating: implemented with some gaps
- Permission board: partially implemented, not fully implemented
- Frontend/backend/database alignment: mostly aligned in core flows, not fully aligned in permission-source handling

### Direct answer: is the permission board implemented?

Short answer: partially.

What is implemented:

- Workspace member access management UI exists
- Per-member permission tick editing exists
- Agent scope editing exists
- Agent skill editing exists
- Project access assignment UI exists
- Support access and support request UI exists

What is not fully implemented:

- No dedicated `Permissions / Roles` page in the dashboard
- No UI for managing database `role_permissions`
- No UI for managing database `user_permissions`
- No backend route/controller layer exposing full role-permission administration
- No end-to-end UI that reads role permissions directly from database tables as source of truth

So the system has a member-access editor, but not a complete permission administration board.

## 1. Database Status

The database layer has the main structures needed for normalized permissions and scoped visibility.

### Implemented tables

From `database/migrations/041_normalize_permissions_and_audit.sql`:

- `permissions`
- `role_permissions`
- `user_permissions`
- `agent_scope`
- `audit_logs`

The same migration also seeds the permission catalog and default role mappings.

From `database/migrations/042_project_users_and_support_requests.sql`:

- `project_users`
- `support_requests`

From `database/migrations/040_add_support_access_and_agent_presence.sql`:

- `support_access`
- `agent_sessions`
- `agent_activity`

### What this means

The database is already structured for:

- role-based permission defaults
- user-level permission overrides
- agent project/campaign/platform/channel scope
- project membership
- temporary support access
- support request workflow
- audit trail
- live presence tracking

### Database conclusion

Database design is strong and is the most complete part of the permission system.

## 2. Backend Status

### Implemented enforcement

The backend enforces workspace permissions through `assertWorkspacePermission()` in:

- `backend-api/src/services/workspaceAccessService.ts`

That function resolves permission from:

- normalized workspace role
- `role_permissions`
- `user_permissions`
- legacy `permissions_json` membership overrides
- support-access bypass for platform operators

Project access is enforced through:

- `backend-api/src/services/projectAccessService.ts`

Conversation visibility is enforced through:

- `backend-api/src/services/conversationService.ts`
- `backend-api/src/services/conversationAssignmentService.ts`
- `backend-api/src/models/conversationModel.ts`

These paths enforce:

- workspace membership
- project membership
- agent-only self/unassigned visibility rules
- agent scope by project/campaign/platform/channel
- assignment eligibility by project access and scope

### Important backend strengths

- Platform operators require active support access before workspace access succeeds
- Project membership is normalized through `project_users`
- Conversation inbox filters are scope-aware
- Assignment capacity and scope matching are implemented
- Audit logging exists for many admin and assignment actions

### Important backend gap

The API for listing workspace members is too open compared with the intended UI/privacy model.

Current behavior:

- `GET /workspaces/:id/members` uses `requireWorkspaceAccess`
- service path `listWorkspaceMembersService()` only checks workspace membership
- it returns all members with `permissions_json`, agent scope, and global role

This means an active workspace member can enumerate workspace users and permission data through API even if the frontend hides the page.

That is a real backend/frontend mismatch.

## 3. Frontend Status

### Implemented visibility system

The frontend visibility model is implemented in:

- `frontend-dashboard/hooks/useVisibility.ts`
- `frontend-dashboard/store/authStore.ts`
- `frontend-dashboard/components/layout/Sidebar.tsx`
- page-level `PageAccessNotice` usage across pages

The frontend does all of the following:

- hides navigation by role
- blocks page rendering for disallowed roles
- hides edit actions based on workspace permissions
- distinguishes platform operators from workspace users
- supports workspace admin, editor, agent, viewer, and project-role fallback behavior

### Implemented management surfaces

Workspace page:

- workspace management
- workspace member add/update
- permission tick editor
- agent scope editor
- agent skill editor
- support access grant/revoke
- support request create/approve/deny
- billing and lock controls

Project page:

- project access summary
- assign project role
- revoke project role
- project settings and visibility controls

Inbox and analytics:

- conversation visibility is role-aware
- assignment recommendations display scope and project-access compatibility
- live agent presence and capacity are shown

### Frontend gap: no full permission board

There is no separate page for:

- permission catalog management
- role permission templates
- user permission overrides from normalized tables
- auditing role definitions themselves

The sidebar has `Workspaces`, `Users`, `Audit`, `Tickets`, and `Settings`, but no dedicated `Permissions` or `Roles` page.

So the dashboard has access-management UI, but not a complete permission board product surface.

## 4. Alignment Review

## 4.1 Database -> Backend

Status: mostly aligned

Aligned:

- backend reads `role_permissions`
- backend reads `user_permissions`
- backend uses `agent_scope`
- backend uses `project_users`
- backend uses `support_access`
- backend uses `support_requests`
- backend uses audit and presence tables

Gap:

- backend still supports legacy `permissions_json` on workspace memberships
- backend still syncs legacy `user_project_access`

This is acceptable transitional compatibility, but it means the permission model is not yet fully clean.

## 4.2 Backend -> Frontend

Status: partially aligned

Aligned:

- page visibility broadly follows role expectations
- project access UI matches backend project membership model
- inbox behavior generally matches backend agent scope rules
- support access/support request features exist in both layers

Not aligned:

- backend treats database permission tables as source of truth
- frontend mostly computes permissions from hardcoded default role maps plus `permissions_json`
- frontend does not appear to load `role_permissions` or `user_permissions` directly

Practical result:

- if database `role_permissions` or `user_permissions` are changed, backend enforcement changes immediately
- frontend buttons/nav may not reflect those changes correctly
- users can see buttons the backend will reject, or miss buttons the backend would allow

That is the main system alignment risk today.

## 4.3 Frontend -> Database

Status: partially aligned

Aligned:

- frontend writes workspace member `permissionsJson`
- frontend writes agent scope
- frontend writes project access
- frontend consumes workspace memberships and project memberships

Not aligned:

- frontend does not expose management for normalized `role_permissions`
- frontend does not expose management for normalized `user_permissions`
- frontend still behaves as if membership-level JSON is the main UI-editable permission layer

So the frontend currently aligns better with legacy-compatible membership overrides than with the new normalized permission tables.

## 5. Permission Board Verdict

Use this exact status:

- Member permission editor: implemented
- Agent scope board: implemented
- Project access board: implemented
- Support access board: implemented
- Full permission board: not fully implemented

### Why it is not fully implemented

Because a full permission board would normally include:

- role template management
- permission catalog display
- per-role allow/deny matrix
- per-user override management
- database-backed visibility of normalized permission rows

Those pieces are not exposed end to end in the current product.

## 6. Confirmed Gaps

### Gap 1: frontend permission source is not the same as backend permission source

Backend source of truth:

- `role_permissions`
- `user_permissions`
- membership overrides

Frontend source of truth:

- hardcoded role permission defaults
- membership `permissions_json`

Impact:

- UI and API authorization can drift

### Gap 2: no dedicated permission/roles administration module

Impact:

- normalized permission tables exist but are not really productized

### Gap 3: workspace member listing API is broader than expected

Impact:

- non-admin workspace users may be able to read workspace user and permission data via API

### Gap 4: legacy compatibility is still present

Impact:

- behavior may remain consistent, but the architecture is not fully normalized yet

### Gap 5: final spec mentions broader operator surfaces than the current UI provides

Examples:

- dedicated permissions/roles page
- broader platform-operator console
- fuller live-operations visibility

## 7. What Is Safely Implemented Today

These areas look solid enough to treat as genuinely implemented:

- workspace membership model
- project membership model
- support access enforcement for platform operators
- workspace permission checks on backend
- project access checks on backend
- conversation scope filtering
- assignment scope and capacity matching
- audit-log foundation
- presence foundation
- workspace member permission editing UI
- project access editing UI

## 8. Final Verdict

If the question is:

"Can I say the permission system exists?"

Answer:

- Yes, the core permission system exists

If the question is:

"Can I say the permission board is fully implemented?"

Answer:

- No, not fully

If the question is:

"Are backend, frontend, and database aligned?"

Answer:

- They are aligned in the main workspace/project/conversation flows
- They are not fully aligned in how permissions are sourced and administered

## 9. Recommended Next Fixes

Priority 1:

- Make frontend permission checks consume backend-resolved permission maps instead of only hardcoded defaults

Priority 2:

- Add dedicated API and UI for `role_permissions` and `user_permissions`

Priority 3:

- Restrict `GET /workspaces/:id/members` to `manage_users` or `manage_permissions`

Priority 4:

- Add a dedicated `Permissions / Roles` page and sidebar entry if that is part of the target product

Priority 5:

- Reduce legacy reliance on `permissions_json` and `user_project_access` once rollout is complete

## 10. Evidence Files

Core database:

- `database/migrations/040_add_support_access_and_agent_presence.sql`
- `database/migrations/041_normalize_permissions_and_audit.sql`
- `database/migrations/042_project_users_and_support_requests.sql`

Core backend:

- `backend-api/src/services/workspaceAccessService.ts`
- `backend-api/src/services/projectAccessService.ts`
- `backend-api/src/services/projectService.ts`
- `backend-api/src/services/conversationService.ts`
- `backend-api/src/services/conversationAssignmentService.ts`
- `backend-api/src/routes/workspaceRoutes.ts`
- `backend-api/src/models/permissionModel.ts`

Core frontend:

- `frontend-dashboard/store/authStore.ts`
- `frontend-dashboard/hooks/useVisibility.ts`
- `frontend-dashboard/components/layout/Sidebar.tsx`
- `frontend-dashboard/pages/workspaces.tsx`
- `frontend-dashboard/pages/projects.tsx`
- `frontend-dashboard/pages/conversations.tsx`
- `frontend-dashboard/pages/analytics.tsx`

## Bottom Line

The platform already has real permission enforcement and real visibility controls.

The missing piece is not the existence of permissions themselves. The missing piece is a complete, normalized, product-grade permission board that uses the same database-backed permission source across frontend and backend.
