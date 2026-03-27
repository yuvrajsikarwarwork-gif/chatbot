# Phase 16 - Agent Assignment

## Goal

Add reliable assignment so conversations can move between bot and human handling without losing runtime context.

## Functional outcomes

- Assign a conversation to an agent manually
- Support auto-assign and later round-robin assignment
- Track who assigned the conversation
- Restrict agent view based on assignment rules
- Preserve assignment history for audits

## Core tables

### assignments

Required fields:

- `id`
- `conversation_id`
- `agent_id`
- `assigned_by`
- `assigned_at`
- `assignment_type`
- `status`
- `notes`

Suggested `assignment_type` values:

- `manual`
- `auto`
- `round_robin`

Suggested `status` values:

- `active`
- `released`
- `reassigned`

### conversations updates

Conversation row should keep the current active assignment pointer:

- `assigned_to`
- `assigned_at`
- `assignment_mode`

History stays in `assignments`.

## Rules

- one active assignment per conversation
- reassignment closes the previous active assignment row
- assignment must stay inside the same workspace
- assigned user must have agent-capable role

## Backend APIs

- `POST /api/conversations/:id/assign`
- `POST /api/conversations/:id/reassign`
- `POST /api/conversations/:id/release`
- `GET /api/conversations/:id/assignments`

Payload examples:

```json
{
  "agentId": "user-123",
  "assignmentType": "manual",
  "notes": "handoff from bot"
}
```

## Auto-assignment behavior

### Initial version

- if `auto_assign` is enabled
- if conversation is unassigned
- if workspace settings allow takeover
- assign to default agent or first available eligible agent

### Future version

- round robin
- load balancing by open chats
- skill-based assignment

## UI requirements

### Conversation right panel

Show:

- current agent
- assignment source
- assigned time
- assign or reassign action
- release action

### Filters

Must support:

- assigned to me
- unassigned
- assigned to specific agent

### Team visibility

Admins can:

- see all
- assign anyone
- release anyone

Agents can:

- see assigned conversations
- optionally see unassigned conversations if allowed by workspace settings

## Permissions

- agent must belong to the same workspace
- agent role must be `agent`, `admin`, or `workspace_owner` if admin assignment is allowed
- users without assignment permission cannot take ownership

## DB and service behavior

When assignment changes:

1. validate workspace
2. validate target user role
3. close previous active assignment
4. insert new assignment record
5. update `conversations.assigned_to`
6. log analytics event

## Frontend implementation slices

### Slice 1

- assign agent dropdown in conversation detail panel
- show current assignee in left list and right panel

### Slice 2

- unassigned and assigned filters
- release and reassign flows

### Slice 3

- assignment history drawer
- capacity indicators per agent

## Completion criteria

- Conversations can be assigned and reassigned
- Current assignee is visible in inbox and detail panel
- Assignment history is queryable
- Workspace and role enforcement prevent invalid assignment
