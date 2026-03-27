# Staging Runtime Verification Playbook

Last updated: 2026-03-23

This playbook captures the real verification work that must be completed in staging or production-like infrastructure for channels and webhooks. It complements the local build verification and local runtime report.

## Goal

Verify that the platform works end to end with:

- real platform credentials
- reachable webhook URLs
- real outbound sends
- real delivery callbacks
- real workspace, project, campaign, assignment, and permission boundaries

## Required Inputs

- staging database
- staging backend reachable over HTTPS
- staging dashboard reachable over HTTPS
- active workspace with at least one project
- active bot in that project
- active campaign with at least one channel and entry point
- active platform account per channel being tested
- test user accounts for:
  - workspace admin
  - project admin or editor
  - agent
  - platform operator (`super_admin` or `developer`)

## Readiness Script

Before channel testing, run:

```powershell
node backend-api/scripts/webhook-readiness.js <workspaceId>
```

This validates that the selected workspace has the minimum project/bot/campaign/channel/account structure required for live testing.

## Channel Verification Matrix

### WhatsApp

1. Verify webhook registration against the staging webhook URL.
2. Send inbound WhatsApp message from a real device.
3. Confirm campaign context resolution and conversation creation.
4. Confirm conversation lands in the correct workspace/project/campaign/channel/list context.
5. Send text reply from inbox.
6. Send template reply from inbox.
7. Send media reply from inbox.
8. Confirm provider message id and delivery status persistence.
9. Confirm status callbacks update the message state in the inbox.

### Website

1. Open the real widget on staging site.
2. Send inbound website message.
3. Confirm conversation lands in the correct project and campaign context.
4. Send reply from inbox.
5. Confirm browser widget receives the reply live.
6. Confirm support for file/image paths used by the composer.

### Email

1. Confirm SMTP credentials are valid for the bound platform account.
2. Send outbound email reply from the inbox.
3. Confirm recipient receives the email with expected formatting.
4. Confirm message provider id and initial status persist.
5. Confirm reply validation rejects invalid recipient or invalid account binding.

## Permission Verification

1. Workspace admin can manage workspace/project/settings/support requests.
2. Project-scoped user can only access assigned project data.
3. Agent only sees allowed project/campaign/platform/channel scope.
4. Viewer cannot mutate runtime/admin state.
5. Platform operator cannot enter workspace without support request approval or support access.
6. Approved support request creates temporary support access and appears in helpdesk history.
7. Revoked or expired support access removes effective operator access.

## Audit Verification

Confirm audit-log rows appear for:

- workspace updates
- billing updates
- workspace member changes
- project member changes
- support request create/approve/deny
- support access grant/revoke
- project settings updates
- conversation settings updates
- assignment changes
- campaign/channel/entry/list changes
- bot/flow/integration changes
- lead deletion

## Exit Criteria

Staging verification is complete when:

- all tested channels pass inbound and outbound flows
- delivery callbacks update at least WhatsApp end to end
- role boundaries behave correctly
- helpdesk request/approval flow works
- audit logs appear for the tested mutation paths
- no cross-workspace or cross-project data leakage is observed
