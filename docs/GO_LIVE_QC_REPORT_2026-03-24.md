# Go-Live QC Report

Last updated: 2026-03-24

This report captures the current go-live quality-control pass focused on:

- audit runtime stability
- campaign launch and campaign activity stability
- frontend/backend build health
- minimum hardening changes applied for a safer live rollout

## 1. What Was Checked

### Frontend

- dashboard route builds
- campaign launch modal request contract
- campaign launch page loading flow
- campaign activity page loading flow
- audit page loading flow
- legacy route consolidation from bridge pages into canonical screens
- theme consistency on the remaining Phase 1 pages already patched

### Backend

- audit route -> controller -> service -> model chain
- campaign routes
- campaign activity query behavior
- template launch flow
- template log listing behavior

## 2. Changes Applied In This Pass

### Audit hardening

Updated:

- `backend-api/src/models/auditLogModel.ts`
- `frontend-dashboard/pages/audit.tsx`

Changes:

- audit log reads now return an empty array instead of a hard `500` when `audit_logs` or expected audit columns are missing in a partially migrated environment
- audit page now renders an explicit UI error state when the request still fails for another reason

### Campaign runtime hardening

Updated:

- `backend-api/src/controllers/templateController.ts`
- `frontend-dashboard/components/campaign/CampaignSenderModal.tsx`

Changes:

- campaign launch no longer fails the entire request after sends complete just because `template_logs` is unavailable
- template log reads now degrade to `[]` when the `template_logs` schema is missing or older than expected
- campaign sender modal now uses string lead IDs to match UUID-based backend behavior
- launch modal now surfaces real backend error messages instead of always showing a generic failure toast
- launch modal resets selected template and selected leads when reopened

## 3. Build Verification

Verified successfully:

- `backend-api`: `npm run build`
- `frontend-dashboard`: `npm run build`

## 4. Main Findings

### Stable / improved

- audit page should no longer crash the frontend when the audit schema is missing
- campaign activity should no longer fail just because `template_logs` is absent
- campaign launch is more resilient because logging is no longer a single point of post-send failure
- bridge routes now redirect users to canonical pages instead of keeping duplicate navigation paths alive

### Remaining operational risks

- no live browser role-by-role click test was completed in this pass
- no live database migration audit was executed against the real production/staging database
- no real outbound campaign send was executed against a live provider account in this pass
- the launch flow still depends on older tables such as `contacts`, `conversations`, `leads`, `templates`, and messaging-provider connectivity being present and correctly configured
- channel maturity is still uneven; WhatsApp/website/email are stronger than some other modeled platforms

## 5. Issues To Resolve Before Public Launch

### High priority

1. Confirm active database has required migrations applied, especially:
   - `041_normalize_permissions_and_audit.sql`
   - any schema creating `template_logs`
   - campaign, contacts, conversations, and leads dependencies

2. Run one real campaign launch test through:
   - campaign setup
   - audience selection
   - approved template selection
   - launch
   - activity verification

3. Run one real audit-page test with a workspace admin account and confirm:
   - page loads
   - filters work
   - payload rendering is readable

### Medium priority

1. Add explicit empty-state/help copy on campaign launch when:
   - no bots exist
   - no approved templates exist
   - no leads exist

2. Add more defensive handling around older runtime tables if production data may still be mid-migration

3. Do browser QA for:
   - dark/light contrast
   - redirect behavior
   - mobile/smaller-width overflow
   - role-gated navigation

### Low priority

1. Replace bridge pages with server-side redirects or rewrites later

2. Add targeted automated tests for:
   - audit route fallback behavior
   - template log fallback behavior
   - campaign launch modal request payloads

## 6. Recommended Go-Live Sequence

1. Verify DB migration state in the live environment.
2. Run backend and frontend in staging with real environment variables.
3. Test login for:
   - super_admin or developer
   - workspace_admin
   - project_admin
   - editor
   - agent
   - viewer
4. Run one controlled campaign send in staging.
5. Verify campaign activity and audit history after that send.
6. If clean, proceed to live rollout.

## 7. Current Go-Live Readiness Summary

The platform is closer to live-ready after this pass, especially because the audit and campaign log paths are now less brittle. The biggest remaining blockers are not build failures, but live-environment verification:

- real DB migration completeness
- real provider integration checks
- real browser QA across roles
- one real controlled launch test

That means the platform is not blocked by the issues fixed here, but it still requires a final staging verification round before a confident public launch.
