# Requirements Checklist

Last reviewed: 2026-03-23

Source documents:

- `docs/campaign-capture-architecture.md`
- `docs/PHASE-15_CONVERSATION_FILE.md`
- `docs/PHASE-16_AGENT_FILE.md`
- `docs/PHASE-17_SETTINGS_FILE.md`

## Campaign-Centric Lead Capture Architecture

- [x] Campaign, channel, entry point, list, conversation, and lead lineage is modeled in backend code and migrations.
- [x] Campaign CRUD exists.
- [x] Campaign channel CRUD exists.
- [x] Entry point CRUD exists.
- [x] List CRUD exists.
- [x] Lead list, detail, and delete APIs exist.
- [x] Runtime campaign context resolution exists.
- [x] Lead capture uses conversation campaign/channel/entry/flow/list context.
- [x] Campaign overview UI exists.
- [x] Campaign detail UI exists.
- [x] Leads filtering UI exists.
- [ ] Full live end-to-end runtime verification across every supported platform is still pending, but local build-path verification and adapter validation coverage have been updated.

## Phase 15 - Conversation System

### Backend

- [x] `GET /api/conversations`
- [x] `GET /api/conversations/:id`
- [x] `GET /api/conversations/:id/messages`
- [x] `POST /api/conversations/:id/reply`
- [x] `PUT /api/conversations/:id/status`
- [x] `PUT /api/conversations/:id/context`
- [x] `PUT /api/conversations/:id/list`
- [x] `POST /api/conversations/:id/notes`
- [x] `POST /api/conversations/:id/tags`
- [x] `DELETE /api/conversations/:id/tags/:tag`
- [x] Workspace-aware filter support for workspace, campaign, channel, platform, platform account, flow, list, agent, status, date range, and search
- [x] Workspace and agent visibility checks exist
- [x] Runtime conversation forking on context change exists
- [x] Send path now uses `conversation_id`, `platform`, and `platform_account_id`
- [x] Reply path now rejects missing `platform_account_id` for WhatsApp conversations
- [x] Reply validation now checks supported outbound adapters with platform-aware errors for WhatsApp, website, and email
- [x] Website and email replies now validate active platform-account ownership when a conversation is bound to a platform account
- [x] Outbound messages now persist provider delivery metadata and update WhatsApp delivery state from webhook callbacks
- [x] Website outbound messages now persist synthetic provider message ids for delivery tracking continuity

### UI

- [x] Three-panel inbox layout exists
- [x] Left panel shows contact, phone, platform, campaign, last message preview, assignee, and status
- [x] Filter controls exist for campaign, platform, platform account, agent, status, date range, and list
- [x] Center thread view exists
- [x] Right-side details panel exists
- [x] Status change action exists
- [x] Assign/reassign/release actions exist
- [x] Notes UI exists
- [x] Tags UI exists
- [x] Move-list UI exists
- [x] Context editing UI exists
- [x] Template sending exists
- [x] Unread/new indicator is shown from inbound-vs-outbound activity
- [x] Waiting indicator is shown in the conversation list
- [x] Message timestamps are shown in thread rendering
- [x] Delivery status is shown in thread rendering when available
- [x] Basic attachment rendering exists for image, video, audio, and document messages
- [x] Composer image upload exists
- [x] Composer file upload exists
- [x] Composer quick reply support exists

## Phase 16 - Agent Assignment

- [x] Assign API exists
- [x] Reassign API exists
- [x] Release API exists
- [x] Assignment history API exists
- [x] Current assignee is shown in list and detail panel
- [x] Assignment history is shown in the inbox UI
- [x] Workspace membership and role enforcement exist
- [x] Agent scope checks exist
- [x] Auto-assignment exists
- [x] Max open chat limit is used in auto-assignment
- [x] Dedicated capacity indicators per agent now exist in the inbox assignment panel
- [x] Auto-assignment now balances by default-agent preference, current open load, pending load, and least-recent assignment time
- [x] Skill-based routing now participates in assignment recommendation and auto-assignment when agent skills are configured

## Phase 17 - Conversation Settings

- [x] Conversation settings table/model exists
- [x] GET settings API exists
- [x] PUT settings API exists
- [x] Settings page UI exists
- [x] Auto-assign setting exists
- [x] Default agent setting exists
- [x] Manual reply setting exists
- [x] Agent takeover setting exists
- [x] Bot resume setting exists
- [x] Show campaign setting exists
- [x] Show flow setting exists
- [x] Show list setting exists
- [x] Max open chats setting exists
- [x] Allowed platforms setting exists
- [x] Default campaign setting exists
- [x] Default list setting exists
- [x] Plan platform validation exists
- [x] Workspace-scoped permissions for editing exist
- [x] Conversation inbox behavior reads settings
- [x] Assignment behavior reads settings
- [x] Settings page shows field-specific validation feedback for key settings inputs

## Next Work

1. Complete broader end-to-end runtime verification across supported platforms.
2. Broaden audit-log adoption and support-mode UX beyond the current normalized foundations.
3. Extend adapter-specific reply validation and delivery tracking to future outbound channels as they become production-ready.
4. Exercise real account/webhook verification for WhatsApp, website, and email runtime flows in staging or production-like environments.

Reference:

- `docs/STAGING_RUNTIME_VERIFICATION_PLAYBOOK.md`
- `backend-api/scripts/webhook-readiness.js`
