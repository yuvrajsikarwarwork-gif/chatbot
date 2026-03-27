# Permission, Visibility, and Alignment Report

Date: 2026-03-23

## Executive Summary

The platform's core permission and visibility system is implemented across database, backend, and frontend.

What is **not** fully implemented yet is a complete, normalized, product-grade **permission board** that uses the same database-backed permission source across all layers.

### Final Status

- Permission system: **Implemented**
- Permission board: **Partially implemented**
- Database foundation: **Implemented**
- Backend enforcement: **Implemented with gaps**
- Frontend visibility and access UI: **Implemented with gaps**
- Backend/frontend/database alignment: **Mostly aligned in core flows, not fully aligned**

## Direct Answer

### Is permission and visibility implemented?

Yes. The core system exists and is active.

### Is the permission board fully implemented?

No. It is only partially implemented.

### Are backend, frontend, and database fully aligned?

No. They are mostly aligned in core flows, but not fully aligned in:

- permission source of truth
- some API access rules
- some UI visibility rules

## What Is Implemented

### Database

The database already contains the main permission and visibility structures:

- `permissions`
- `role_permissions`
- `user_permissions`
- `agent_scope`
- `project_users`
- `support_access`
- `support_requests`
- `audit_logs`
- agent presence and activity tables

This means the database is already ready for:

- role-based permission defaults
- user-level permission overrides
- project-scoped access
- agent scope restriction by project, campaign, platform, and channel
- temporary platform support access
- support approval workflow
- audit history

### Backend

The backend enforces the main access rules.

Implemented behavior includes:

- workspace membership checks
- workspace permission checks
- project membership and access checks
- support-access enforcement for platform operators
- conversation visibility checks
- agent scope filtering
- assignment capacity and eligibility logic
- audit logging on many admin and assignment actions

### Frontend

The frontend already has real visibility and access-management UI.

Implemented UI includes:

- role-based sidebar visibility
- role-based page visibility
- workspace member management
- per-member permission tick editing
- agent scope editing
- agent skill editing
- project access assignment UI
- support access grant/revoke UI
- support request workflow UI
- audit history page

## What Is Not Fully Implemented

The missing piece is the **full permission board**.

The codebase does **not** yet provide:

- a dedicated `Permissions` or `Roles` page
- direct administration UI for `role_permissions`
- direct administration UI for `user_permissions`
- a database-backed role/permission matrix editor
- frontend permission resolution based directly on normalized permission tables

So the current system is best described as:

**real permission system present, full permission board not finished**

## Alignment Review

### Database -> Backend

This is mostly aligned.

The backend already reads and uses:

- `role_permissions`
- `user_permissions`
- `agent_scope`
- `project_users`
- `support_access`
- `support_requests`

However, the backend still keeps transitional compatibility with:

- `workspace_memberships.permissions_json`
- `user_project_access`

That is acceptable for migration compatibility, but it means the model is not yet fully clean.

### Backend -> Frontend

This is only partially aligned.

The backend treats the normalized database permission tables as source of truth.

The frontend still mostly calculates permissions from:

- hardcoded default role maps
- `permissions_json` overrides

The frontend does **not** appear to directly load and use:

- `role_permissions`
- `user_permissions`

This creates a mismatch risk:

If normalized permission rows change in the database, backend enforcement changes immediately, but frontend visibility may not reflect that change correctly.

## Confirmed Gaps Found in Code Review

### 1. Workspace member listing is too open in backend

Current behavior:

- `GET /workspaces/:id/members` only requires workspace access
- it does not require `manage_users` or `manage_permissions`
- it returns member data, roles, `permissions_json`, agent scope, and global role

Impact:

Any active workspace member may be able to enumerate workspace user and permission data through the API, even if the frontend hides the management page.

### 2. Audit page access is mismatched

Current behavior:

- frontend audit page allows access for users with:
  - `manage_workspace`
  - `manage_users`
  - `manage_permissions`
- backend audit API currently requires:
  - `manage_workspace`

Impact:

Some users may see the audit page in frontend but get blocked by backend.

### 3. Assignment eligibility logic is not fully clean

Current behavior:

- assignment candidate listing includes roles such as `editor` and `user`
- eligibility can be marked true before final assignment validation
- final assignment path later rejects some of those roles

Impact:

The UI can show assignment candidates as eligible even when final assignment would fail.

## Practical Verdict

### What you can safely say

- The permission system exists
- Workspace, project, support, and agent visibility controls exist
- Backend enforcement exists
- Frontend access UI exists
- Database foundation exists

### What you should not say

- The permission board is fully implemented
- Frontend and backend use exactly the same permission source
- All access rules are fully aligned everywhere

## Recommended Next Actions

### Priority 1

Restrict `GET /workspaces/:id/members` to users with:

- `manage_users`, or
- `manage_permissions`

### Priority 2

Make frontend permission checks consume backend-resolved permission maps instead of relying mainly on:

- hardcoded role defaults
- `permissions_json`

### Priority 3

Add dedicated API and UI for:

- `role_permissions`
- `user_permissions`
- permission catalog display
- per-role permission matrix editing

### Priority 4

Align audit visibility rules between frontend and backend.

### Priority 5

Fix assignment candidate eligibility so the UI only marks truly assignable users as eligible.

## Bottom Line

The platform already has a **real permission and visibility system**.

The unfinished part is the **full permission board** and the **complete alignment of permission source-of-truth across database, backend, and frontend**.

## Reviewed Areas

### Database

- `database/migrations/040_add_support_access_and_agent_presence.sql`
- `database/migrations/041_normalize_permissions_and_audit.sql`
- `database/migrations/042_project_users_and_support_requests.sql`

### Backend

- `backend-api/src/services/workspaceAccessService.ts`
- `backend-api/src/services/workspaceService.ts`
- `backend-api/src/services/projectAccessService.ts`
- `backend-api/src/services/projectService.ts`
- `backend-api/src/services/conversationService.ts`
- `backend-api/src/services/conversationAssignmentService.ts`
- `backend-api/src/services/auditService.ts`
- `backend-api/src/routes/workspaceRoutes.ts`
- `backend-api/src/routes/projectRoutes.ts`
- `backend-api/src/models/permissionModel.ts`
- `backend-api/src/models/workspaceMembershipModel.ts`
- `backend-api/src/models/projectAccessModel.ts`
- `backend-api/src/models/conversationModel.ts`

### Frontend

- `frontend-dashboard/hooks/useVisibility.ts`
- `frontend-dashboard/store/authStore.ts`
- `frontend-dashboard/components/layout/Sidebar.tsx`
- `frontend-dashboard/pages/workspaces.tsx`
- `frontend-dashboard/pages/projects.tsx`
- `frontend-dashboard/pages/conversations.tsx`
- `frontend-dashboard/pages/audit.tsx`
- `frontend-dashboard/services/workspaceMembershipService.ts`
- `frontend-dashboard/services/workspaceService.ts`
- `frontend-dashboard/services/auditService.ts`
