# Phase 17 - Conversation Settings

## Goal

Add workspace-level conversation controls so inbox behavior is configurable without hardcoding workflow rules into routes or UI.

## Functional outcomes

- Control auto-assign behavior per workspace
- Control agent takeover and bot resume
- Configure which context fields are shown in the UI
- Set limits such as max open chats per agent

## Core table

### conversation_settings

Required fields:

- `workspace_id`
- `auto_assign`
- `default_agent`
- `allow_manual_reply`
- `allow_agent_takeover`
- `allow_bot_resume`
- `show_campaign`
- `show_flow`
- `show_list`
- `max_open_chats`
- `allowed_platforms`
- `default_campaign_id`
- `default_list_id`
- `created_at`
- `updated_at`

Example:

```json
{
  "auto_assign": true,
  "default_agent": "user-123",
  "allow_manual_reply": true,
  "allow_agent_takeover": true,
  "allow_bot_resume": false,
  "show_campaign": true,
  "show_flow": true,
  "show_list": true,
  "max_open_chats": 25
}
```

## Behavior rules

- settings are workspace-scoped
- only admins and workspace owners can edit settings
- `default_agent` must belong to the workspace
- `allowed_platforms` must align with workspace plan
- `max_open_chats` applies to auto-assignment rules

## Backend APIs

- `GET /api/conversation-settings/:workspaceId`
- `PUT /api/conversation-settings/:workspaceId`

## UI requirements

### Settings page section

Expose:

- auto assign on or off
- default agent
- allow manual reply
- allow agent takeover
- allow bot resume
- show campaign in inbox
- show flow in inbox
- show list in inbox
- default campaign
- default list
- allowed platforms
- max chats per agent

### Validation feedback

The UI should show clear errors if:

- default agent is inactive
- default campaign is outside the workspace
- default list is invalid
- platform is not allowed under the current plan

## Interaction with Phase 15 and 16

### Conversation system

- filter and detail panel visibility can depend on settings
- reply composer can be disabled if manual reply is blocked

### Agent assignment

- auto-assign logic reads `conversation_settings`
- manual takeover respects `allow_agent_takeover`
- bot resume respects `allow_bot_resume`

## Implementation slices

### Slice 1

- create `conversation_settings`
- add GET and PUT APIs
- add settings form on `/settings`

### Slice 2

- wire settings into conversation UI behavior
- disable blocked actions based on workspace settings

### Slice 3

- wire settings into assignment behavior
- add validation and warnings for misconfiguration

## Files expected in this repo

- `backend-api/src/routes/conversationSettingsRoutes.ts`
- `backend-api/src/controllers/conversationSettingsController.ts`
- `backend-api/src/services/conversationSettingsService.ts`
- `backend-api/src/models/conversationSettingsModel.ts`
- `frontend-dashboard/pages/settings.tsx`
- `frontend-dashboard/services/conversationSettingsService.ts`

## Completion criteria

- Each workspace has conversation settings
- Settings can be edited by authorized roles
- Assignment and reply behavior respond to settings
- Platform and permission limits stay aligned with workspace policy
