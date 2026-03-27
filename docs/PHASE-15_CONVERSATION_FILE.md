# Phase 15 - Conversation System

## Goal

Build a multi-platform inbox that works across:

- workspaces
- campaigns
- channels
- platform accounts
- flows
- lists

The conversation module must behave like one inbox with strict context isolation, not a generic contact-to-message thread.

## Functional outcomes

- Show chats from all supported platforms in one inbox
- Isolate conversations by `workspace_id`
- Preserve campaign runtime context on every conversation
- Show conversation metadata in the UI
- Filter by campaign, platform, account, flow, list, status, and agent
- Reply using `platform_account_id`, not just `platform`

## Core data model

### conversations

Required fields:

- `id`
- `workspace_id`
- `contact_id`
- `contact_phone`
- `contact_name`
- `platform`
- `platform_account_id`
- `campaign_id`
- `channel_id`
- `entry_point_id`
- `flow_id`
- `list_id`
- `bot_id`
- `assigned_to`
- `status`
- `context_json`
- `last_message_at`
- `created_at`
- `updated_at`

Suggested status values:

- `open`
- `pending`
- `resolved`
- `closed`
- `bot`
- `agent`

### messages

Required fields:

- `id`
- `conversation_id`
- `platform`
- `platform_account_id`
- `sender_type`
- `sender_id`
- `message_type`
- `text`
- `media_url`
- `status`
- `created_at`

Allowed `sender_type` values:

- `user`
- `bot`
- `agent`
- `system`

Allowed `message_type` values:

- `text`
- `image`
- `video`
- `audio`
- `document`
- `template`
- `button`
- `list`

## Isolation rules

A conversation must not be reused unless these values are compatible:

- `workspace_id`
- `platform`
- `platform_account_id`
- `campaign_id`
- `channel_id`
- `entry_point_id`
- `flow_id`
- `list_id`

If a new inbound event changes that context, runtime must create or fork a new conversation instead of mutating the old one.

## UI layout

Conversation page must use a three-panel layout:

### Left panel

Shows conversation list with:

- contact name
- phone
- platform
- campaign
- last message preview
- assigned agent
- status
- unread or waiting indicator

Filters:

- workspace
- campaign
- platform
- platform account
- agent
- status
- date range
- list

### Center panel

Shows the active thread:

- messages
- timestamp
- sender
- delivery status
- attachments
- templates
- buttons

Composer supports:

- text
- image
- file
- template
- quick reply

Send path must use:

- `platform`
- `platform_account_id`
- `conversation_id`

### Right panel

Shows conversation context:

- lead info
- campaign
- flow
- list
- entry point
- platform
- platform account
- assigned agent
- tags
- notes

Actions:

- assign agent
- change status
- add tag
- add note
- move list

## Backend APIs

### Inbox

- `GET /api/conversations`
  - supports:
    - `workspaceId`
    - `campaignId`
    - `channelId`
    - `platform`
    - `platformAccountId`
    - `flowId`
    - `listId`
    - `agentId`
    - `status`
    - `dateFrom`
    - `dateTo`
    - `search`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/messages`

### Actions

- `POST /api/conversations/:id/reply`
- `PUT /api/conversations/:id/status`
- `PUT /api/conversations/:id/context`
- `PUT /api/conversations/:id/list`

### Notes and tags

- `POST /api/conversations/:id/notes`
- `POST /api/conversations/:id/tags`
- `DELETE /api/conversations/:id/tags/:tag`

## Permissions

Before opening or mutating a conversation:

- validate workspace access
- validate workspace role
- validate agent visibility rules

Suggested rules:

- `workspace_owner` and `admin`: full access
- `user`: read only unless explicitly allowed
- `agent`: assigned conversations only, or unassigned conversations if takeover is allowed

## Frontend implementation slices

### Slice 1

- add filter bar
- add platform and campaign badges in conversation list
- add right-side detail panel shell

### Slice 2

- use `platform_account_id` in reply path
- show full conversation metadata
- add status change action

### Slice 3

- add notes and tags
- add move-list action
- add richer platform-specific rendering

## Validation rules

- conversation must belong to active workspace
- referenced campaign must match conversation workspace
- `platform_account_id` must belong to the same workspace
- reply path must reject missing or invalid platform account
- UI filters must match backend-supported filters

## Files expected in this repo

Likely implementation targets:

- `backend-api/src/routes/conversationRoutes.ts`
- `backend-api/src/controllers/conversationController.ts`
- `backend-api/src/services/conversationService.ts`
- `backend-api/src/models/conversationModel.ts`
- `backend-api/src/services/messageService.ts`
- `frontend-dashboard/pages/conversations.tsx`
- `frontend-dashboard/components/chat/ConversationList.tsx`
- `frontend-dashboard/components/chat/ChatWindow.tsx`
- `frontend-dashboard/services/conversationService.ts`

## Completion criteria

- Inbox shows multi-platform conversations with filters
- Reply uses `platform_account_id`
- Conversation details panel shows runtime context
- Workspace and campaign isolation hold under filters and reply flows
- Permissions prevent cross-workspace and unauthorized agent access
