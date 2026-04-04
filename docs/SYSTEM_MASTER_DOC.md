# System Master Doc

Last updated: 2026-04-03

This is a source-backed map of the chatbot platform. It focuses on the actual code paths, tables, and runtime flows that exist in this repository.

## Evidence Base

Backend:

- [backend-api/package.json](D:/projects/chatbot/backend-api/package.json)
- [backend-api/src/config/env.ts](D:/projects/chatbot/backend-api/src/config/env.ts)
- [backend-api/src/app.ts](D:/projects/chatbot/backend-api/src/app.ts)
- [backend-api/src/server.ts](D:/projects/chatbot/backend-api/src/server.ts)
- [backend-api/src/routes/index.ts](D:/projects/chatbot/backend-api/src/routes/index.ts)
- [backend-api/src/routes/webhookRoutes.ts](D:/projects/chatbot/backend-api/src/routes/webhookRoutes.ts)
- [backend-api/src/controllers/webhookController.ts](D:/projects/chatbot/backend-api/src/controllers/webhookController.ts)
- [backend-api/src/controllers/triggerFlowController.ts](D:/projects/chatbot/backend-api/src/controllers/triggerFlowController.ts)
- [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts)
- [backend-api/src/services/flowTriggerRouterService.ts](D:/projects/chatbot/backend-api/src/services/flowTriggerRouterService.ts)
- [backend-api/src/services/flowConfirmationService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationService.ts)
- [backend-api/src/services/flowConfirmationHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationHandlerService.ts)
- [backend-api/src/services/flowConfirmationBookmarkService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationBookmarkService.ts)
- [backend-api/src/services/flowConfirmationTimeoutQueueService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationTimeoutQueueService.ts)
- [backend-api/src/services/flowInputHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowInputHandlerService.ts)
- [backend-api/src/services/flowFallbackService.ts](D:/projects/chatbot/backend-api/src/services/flowFallbackService.ts)
- [backend-api/src/services/messageRouter.ts](D:/projects/chatbot/backend-api/src/services/messageRouter.ts)
- [backend-api/src/connectors/whatsapp/whatsappAdapter.ts](D:/projects/chatbot/backend-api/src/connectors/whatsapp/whatsappAdapter.ts)
- [backend-api/src/services/botSettingsService.ts](D:/projects/chatbot/backend-api/src/services/botSettingsService.ts)
- [backend-api/src/services/conversationRuntimeStateService.ts](D:/projects/chatbot/backend-api/src/services/conversationRuntimeStateService.ts)
- [backend-api/src/services/conversationContextPatchService.ts](D:/projects/chatbot/backend-api/src/services/conversationContextPatchService.ts)

Frontend:

- [frontend-dashboard/package.json](D:/projects/chatbot/frontend-dashboard/package.json)
- [frontend-dashboard/config/flowConstants.ts](D:/projects/chatbot/frontend-dashboard/config/flowConstants.ts)
- [frontend-dashboard/pages/flows.tsx](D:/projects/chatbot/frontend-dashboard/pages/flows.tsx)
- [frontend-dashboard/components/flow/NodeEditor.tsx](D:/projects/chatbot/frontend-dashboard/components/flow/NodeEditor.tsx)
- [frontend-dashboard/components/flow/NodeComponent.tsx](D:/projects/chatbot/frontend-dashboard/components/flow/NodeComponent.tsx)

Schema:

- [database/migrations/001_create_users.sql](D:/projects/chatbot/database/migrations/001_create_users.sql)
- [database/migrations/002_create_bots.sql](D:/projects/chatbot/database/migrations/002_create_bots.sql)
- [database/migrations/003_create_flows.sql](D:/projects/chatbot/database/migrations/003_create_flows.sql)
- [database/migrations/005_create_conversations.sql](D:/projects/chatbot/database/migrations/005_create_conversations.sql)
- [database/migrations/006_create_messages.sql](D:/projects/chatbot/database/migrations/006_create_messages.sql)
- [database/migrations/020_create_workspaces.sql](D:/projects/chatbot/database/migrations/020_create_workspaces.sql)
- [database/migrations/022_create_workspace_memberships.sql](D:/projects/chatbot/database/migrations/022_create_workspace_memberships.sql)
- [database/migrations/037_add_projects_layer.sql](D:/projects/chatbot/database/migrations/037_add_projects_layer.sql)
- [database/migrations/040_add_support_access_and_agent_presence.sql](D:/projects/chatbot/database/migrations/040_add_support_access_and_agent_presence.sql)
- [database/migrations/042_project_users_and_support_requests.sql](D:/projects/chatbot/database/migrations/042_project_users_and_support_requests.sql)
- [database/migrations/044_create_contact_identities.sql](D:/projects/chatbot/database/migrations/044_create_contact_identities.sql)
- [database/migrations/045_create_support_surveys.sql](D:/projects/chatbot/database/migrations/045_create_support_surveys.sql)
- [database/migrations/047_create_wallet_and_embeddings.sql](D:/projects/chatbot/database/migrations/047_create_wallet_and_embeddings.sql)
- [database/migrations/051_create_platform_settings.sql](D:/projects/chatbot/database/migrations/051_create_platform_settings.sql)
- [database/migrations/056_create_lead_forms.sql](D:/projects/chatbot/database/migrations/056_create_lead_forms.sql)
- [database/migrations/058_create_flow_trigger_receipts.sql](D:/projects/chatbot/database/migrations/058_create_flow_trigger_receipts.sql)
- [database/migrations/059_add_bot_settings_json.sql](D:/projects/chatbot/database/migrations/059_add_bot_settings_json.sql)
- [database/migrations/060_add_bookmarked_state_to_conversation_state.sql](D:/projects/chatbot/database/migrations/060_add_bookmarked_state_to_conversation_state.sql)
- [database/migrations/061_add_global_settings_to_bots.sql](D:/projects/chatbot/database/migrations/061_add_global_settings_to_bots.sql)
- [database/migrations/063_add_is_system_flow_to_flows.sql](D:/projects/chatbot/database/migrations/063_add_is_system_flow_to_flows.sql)
- [database/migrations/066_create_workspace_settings.sql](D:/projects/chatbot/database/migrations/066_create_workspace_settings.sql)

## 1. Stack

Backend package dependencies in [backend-api/package.json](D:/projects/chatbot/backend-api/package.json#L35):

- `express`
- `pg`
- `ioredis`
- `axios`
- `socket.io`
- `socket.io-client`
- `multer`
- `jsonwebtoken`
- `bcryptjs`
- `cors`
- `dotenv`
- `csv-parser`
- `node-cron`
- `nodemailer`

Frontend package dependencies in [frontend-dashboard/package.json](D:/projects/chatbot/frontend-dashboard/package.json#L11):

- `next`
- `react`
- `react-dom`
- `reactflow`
- `axios`
- `socket.io-client`
- `zustand`
- `lucide-react`

## 2. Environment Variables

Backend env names in [backend-api/src/config/env.ts](D:/projects/chatbot/backend-api/src/config/env.ts#L11):

- `PORT`
- `DB_URL`
- `REDIS_URL`
- `INTERNAL_ENGINE_SECRET`
- `JWT_SECRET`
- `PUBLIC_API_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- `INTEGRATION_SECRET_KEY`
- `INTEGRATION_SECRET_KEY_PREVIOUS`
- `INTEGRATION_SECRET_KEY_VERSION`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_VERSION`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `EMAIL_PROVIDER`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM`
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM`
- `NODE_ENV`
- `MAX_CAMPAIGNS_PER_USER`
- `MAX_PLATFORM_ACCOUNTS_PER_USER`
- `MAX_USERS_PER_WORKSPACE`
- `MAX_PROJECTS_PER_WORKSPACE`
- `MAX_BOTS_PER_WORKSPACE`
- `ALLOWED_PLATFORM_TYPES`
- `FLOW_CONFIRMATION_TIMEOUT_MINUTES`
- `TRIGGER_CONFIRMATION_TIMEOUT_POLL_INTERVAL_MS`
- `FLOW_WAIT_POLL_INTERVAL_MS`
- `TEMPLATE_BROADCAST_POLL_INTERVAL_MS`

Frontend env names:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_PORT`

## 3. Startup and Routing

The backend app mounts CORS, JSON parsing, request ids, uploads, and routes in [backend-api/src/app.ts](D:/projects/chatbot/backend-api/src/app.ts#L27).

Main route groups are mounted in [backend-api/src/routes/index.ts](D:/projects/chatbot/backend-api/src/routes/index.ts).

The server boot sequence in [backend-api/src/server.ts](D:/projects/chatbot/backend-api/src/server.ts#L45) starts:

- `startFlowWaitQueueProcessor(io)`
- `startFlowConfirmationTimeoutQueueProcessor(io)`
- `startTemplateBroadcastQueueProcessor(io)`
- cron jobs for agent resume, workspace purge, export jobs, and campaign automation

Webhook routes are defined in [backend-api/src/routes/webhookRoutes.ts](D:/projects/chatbot/backend-api/src/routes/webhookRoutes.ts#L13).

## 4. Webhook and Trigger Flow

Inbound Meta/WhatsApp handling lives in [backend-api/src/controllers/webhookController.ts](D:/projects/chatbot/backend-api/src/controllers/webhookController.ts).

It:

- verifies webhook tokens
- handles WhatsApp status callbacks
- parses text, interactive button replies, and list replies
- resolves the correct bot from campaign channel or platform account
- passes user text into `processIncomingMessage(...)`
- supports the internal `requireExplicitTrigger` fallback when multiple campaign channels are possible

The internal trigger endpoint is [backend-api/src/controllers/triggerFlowController.ts](D:/projects/chatbot/backend-api/src/controllers/triggerFlowController.ts).

Keyword matching is split across:

- [backend-api/src/services/flowTriggerRouterService.ts](D:/projects/chatbot/backend-api/src/services/flowTriggerRouterService.ts#L40)
- [backend-api/src/services/botSettingsService.ts](D:/projects/chatbot/backend-api/src/services/botSettingsService.ts#L282)
- [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts#L1079)
- [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts#L1760)

## 5. Flow Engine

The runtime runner is `executeFlowFromNode(...)` in [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts#L1877).

It is an imperative loop, not a recursive engine. Node traversal is handle-based and uses helper lookups such as:

- `findNextNode(...)`
- `findImplicitNextNode(...)`
- `findStartNodeTargetInFlow(...)`
- `findTriggerNodeTargetInFlow(...)`
- `resolveFlowEntryNode(...)`

The incoming message orchestrator is [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts#L2665).

Current runtime branches include:

- opt-out handling
- reset / escape handling
- confirmation handling
- active input capture
- fallback handling
- idle trigger launch

The engine delegates specialized logic to:

- [backend-api/src/services/flowConfirmationHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationHandlerService.ts#L47)
- [backend-api/src/services/flowInputHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowInputHandlerService.ts#L63)
- [backend-api/src/services/flowFallbackService.ts](D:/projects/chatbot/backend-api/src/services/flowFallbackService.ts#L43)
- [backend-api/src/services/conversationRuntimeStateService.ts](D:/projects/chatbot/backend-api/src/services/conversationRuntimeStateService.ts)
- [backend-api/src/services/conversationContextPatchService.ts](D:/projects/chatbot/backend-api/src/services/conversationContextPatchService.ts)

## 6. Confirmation and Bookmarking

Confirmation prompt state is built in [backend-api/src/services/flowConfirmationService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationService.ts#L58).

The prompt uses a button payload from [backend-api/src/services/flowConfirmationService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationService.ts#L178), and the button labels are `Yes` and `No`.

The confirmation handler is [backend-api/src/services/flowConfirmationHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationHandlerService.ts#L47).

Behavior:

- `yes` restores the bookmarked trigger target and executes it
- `no` restores the bookmarked node and variables
- unknown input re-prompts with buttons

Bookmark persistence and restore flow live in [backend-api/src/services/flowConfirmationBookmarkService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationBookmarkService.ts).

Confirmation timeout polling is handled by [backend-api/src/services/flowConfirmationTimeoutQueueService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationTimeoutQueueService.ts#L7).

## 7. Session Persistence

The current node is stored in Postgres on `conversations.current_node`.

Other runtime state fields used by the engine:

- `flow_id`
- `variables`
- `status`
- `retry_count`
- `context_json`
- `last_message_at`
- `updated_at`

This is persisted and updated through [backend-api/src/services/conversationRuntimeStateService.ts](D:/projects/chatbot/backend-api/src/services/conversationRuntimeStateService.ts).

The bookmark / interruption state is stored inside `conversations.context_json` under:

- `bookmarked_state`
- `trigger_confirmation_pending`

The bookmark column itself was added in [database/migrations/060_add_bookmarked_state_to_conversation_state.sql](D:/projects/chatbot/database/migrations/060_add_bookmarked_state_to_conversation_state.sql).

## 8. Message Types

Inbound WhatsApp message parsing in [backend-api/src/controllers/webhookController.ts](D:/projects/chatbot/backend-api/src/controllers/webhookController.ts) covers:

- text
- interactive button reply
- interactive list reply
- statuses
- template webhook events

The engine emits `GenericMessage` variants from [backend-api/src/services/messageRouter.ts](D:/projects/chatbot/backend-api/src/services/messageRouter.ts#L284):

- `text`
- `interactive`
- `system`
- `template`
- `media`
- `image`
- `video`
- `audio`
- `document`

The WhatsApp adapter in [backend-api/src/connectors/whatsapp/whatsappAdapter.ts](D:/projects/chatbot/backend-api/src/connectors/whatsapp/whatsappAdapter.ts) supports:

- plain text
- interactive list messages
- interactive button messages
- templates
- images
- videos
- audio
- documents

## 9. Flow Builder Nodes

The canonical node catalog is in [frontend-dashboard/config/flowConstants.ts](D:/projects/chatbot/frontend-dashboard/config/flowConstants.ts#L21).

Supported builder nodes:

- `message`
- `send_template`
- `input`
- `menu`
- `condition`
- `split_traffic`
- `business_hours`
- `goto`
- `delay`
- `api`
- `save`
- `knowledge_lookup`
- `ai_generate`
- `assign_agent`
- `start`
- `end`
- `trigger`
- `resume_bot`

The builder normalizes types in [frontend-dashboard/pages/flows.tsx](D:/projects/chatbot/frontend-dashboard/pages/flows.tsx#L148), validates graphs in [frontend-dashboard/pages/flows.tsx](D:/projects/chatbot/frontend-dashboard/pages/flows.tsx#L310), and generates defaults in [frontend-dashboard/pages/flows.tsx](D:/projects/chatbot/frontend-dashboard/pages/flows.tsx#L1471).

Node editor and renderer coverage is in:

- [frontend-dashboard/components/flow/NodeEditor.tsx](D:/projects/chatbot/frontend-dashboard/components/flow/NodeEditor.tsx)
- [frontend-dashboard/components/flow/NodeComponent.tsx](D:/projects/chatbot/frontend-dashboard/components/flow/NodeComponent.tsx)

The builder ships with system blueprints for:

- human handoff
- CSAT

Those blueprints are in [frontend-dashboard/pages/flows.tsx](D:/projects/chatbot/frontend-dashboard/pages/flows.tsx#L820).

## 10. Multi-Tenancy

Tenant isolation uses:

- `workspace_id`
- `project_id`
- `bot_id`
- `campaign_id`
- `channel_id`
- `entry_point_id`
- `platform_account_id`

Core tables:

- workspaces: [database/migrations/020_create_workspaces.sql](D:/projects/chatbot/database/migrations/020_create_workspaces.sql)
- workspace memberships: [database/migrations/022_create_workspace_memberships.sql](D:/projects/chatbot/database/migrations/022_create_workspace_memberships.sql)
- projects: [database/migrations/037_add_projects_layer.sql](D:/projects/chatbot/database/migrations/037_add_projects_layer.sql)
- project users: [database/migrations/042_project_users_and_support_requests.sql](D:/projects/chatbot/database/migrations/042_project_users_and_support_requests.sql)

The project-layer migration backfills `project_id` across bots, flows, conversations, messages, campaigns, platform accounts, lists, leads, and assignments. The strongest single source for that layer is [database/migrations/037_add_projects_layer.sql](D:/projects/chatbot/database/migrations/037_add_projects_layer.sql).

## 11. Database Map

Core tables and their base migrations:

- `users` -> [database/migrations/001_create_users.sql](D:/projects/chatbot/database/migrations/001_create_users.sql)
- `bots` -> [database/migrations/002_create_bots.sql](D:/projects/chatbot/database/migrations/002_create_bots.sql)
- `flows` -> [database/migrations/003_create_flows.sql](D:/projects/chatbot/database/migrations/003_create_flows.sql)
- `conversations` -> [database/migrations/005_create_conversations.sql](D:/projects/chatbot/database/migrations/005_create_conversations.sql)
- `messages` -> [database/migrations/006_create_messages.sql](D:/projects/chatbot/database/migrations/006_create_messages.sql)
- `workspaces` -> [database/migrations/020_create_workspaces.sql](D:/projects/chatbot/database/migrations/020_create_workspaces.sql)
- `workspace_memberships` -> [database/migrations/022_create_workspace_memberships.sql](D:/projects/chatbot/database/migrations/022_create_workspace_memberships.sql)
- `projects` / `project_users` / `project_settings` -> [database/migrations/037_add_projects_layer.sql](D:/projects/chatbot/database/migrations/037_add_projects_layer.sql)
- `support_access`, `agent_sessions`, `agent_activity` -> [database/migrations/040_add_support_access_and_agent_presence.sql](D:/projects/chatbot/database/migrations/040_add_support_access_and_agent_presence.sql)
- `support_requests` -> [database/migrations/042_project_users_and_support_requests.sql](D:/projects/chatbot/database/migrations/042_project_users_and_support_requests.sql)
- `contact_identities` -> [database/migrations/044_create_contact_identities.sql](D:/projects/chatbot/database/migrations/044_create_contact_identities.sql)
- `support_surveys` -> [database/migrations/045_create_support_surveys.sql](D:/projects/chatbot/database/migrations/045_create_support_surveys.sql)
- `wallet_transactions`, `document_embeddings` -> [database/migrations/047_create_wallet_and_embeddings.sql](D:/projects/chatbot/database/migrations/047_create_wallet_and_embeddings.sql)
- `platform_settings` -> [database/migrations/051_create_platform_settings.sql](D:/projects/chatbot/database/migrations/051_create_platform_settings.sql)
- `lead_forms`, `lead_form_fields` -> [database/migrations/056_create_lead_forms.sql](D:/projects/chatbot/database/migrations/056_create_lead_forms.sql)
- `flow_trigger_receipts` -> [database/migrations/058_create_flow_trigger_receipts.sql](D:/projects/chatbot/database/migrations/058_create_flow_trigger_receipts.sql)
- `bot.settings_json` -> [database/migrations/059_add_bot_settings_json.sql](D:/projects/chatbot/database/migrations/059_add_bot_settings_json.sql)
- `conversation_state.bookmarked_state` -> [database/migrations/060_add_bookmarked_state_to_conversation_state.sql](D:/projects/chatbot/database/migrations/060_add_bookmarked_state_to_conversation_state.sql)
- `bots.global_settings` -> [database/migrations/061_add_global_settings_to_bots.sql](D:/projects/chatbot/database/migrations/061_add_global_settings_to_bots.sql)
- `flows.is_system_flow` -> [database/migrations/063_add_is_system_flow_to_flows.sql](D:/projects/chatbot/database/migrations/063_add_is_system_flow_to_flows.sql)
- `workspace_settings` -> [database/migrations/066_create_workspace_settings.sql](D:/projects/chatbot/database/migrations/066_create_workspace_settings.sql)

Main foreign-key relationships observed in migrations:

- `workspaces.owner_user_id -> users.id`
- `workspace_memberships.workspace_id -> workspaces.id`
- `workspace_memberships.user_id -> users.id`
- `projects.workspace_id -> workspaces.id`
- `user_project_access.project_id -> projects.id`
- `project_users.project_id -> projects.id`
- `bots.user_id -> users.id`
- `bots.workspace_id -> workspaces.id`
- `bots.project_id -> projects.id`
- `flows.bot_id -> bots.id`
- `flows.workspace_id -> workspaces.id`
- `flows.project_id -> projects.id`
- `conversations.bot_id -> bots.id`
- `conversations.workspace_id -> workspaces.id`
- `conversations.project_id -> projects.id`
- `messages.bot_id -> bots.id`
- `messages.conversation_id -> conversations.id`
- `messages.workspace_id -> workspaces.id`
- `messages.project_id -> projects.id`
- `contact_identities.contact_id -> contacts.id`
- `support_surveys.conversation_id -> conversations.id`
- `flow_trigger_receipts.flow_id -> flows.id`
- `flow_trigger_receipts.conversation_id -> conversations.id`
- `flow_trigger_receipts.contact_id -> contacts.id`

## 12. Runtime Support Tables and Queues

The runtime uses Postgres-backed queue jobs and pollers rather than a pure in-memory executor.

Relevant files:

- [backend-api/src/server.ts](D:/projects/chatbot/backend-api/src/server.ts)
- [backend-api/src/models/queueJobModel.ts](D:/projects/chatbot/backend-api/src/models/queueJobModel.ts)
- [backend-api/src/services/flowWaitQueueService.ts](D:/projects/chatbot/backend-api/src/services/flowWaitQueueService.ts)
- [backend-api/src/services/flowConfirmationTimeoutQueueService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationTimeoutQueueService.ts)
- [backend-api/src/services/templateBroadcastQueueService.ts](D:/projects/chatbot/backend-api/src/services/templateBroadcastQueueService.ts)

Queue-backed behaviors:

- flow wait reminders
- flow wait timeouts
- confirmation expiry
- template broadcast jobs

## 13. Integration and Platform Settings

Platform and account integration config is spread across:

- [backend-api/src/services/integrationService.ts](D:/projects/chatbot/backend-api/src/services/integrationService.ts)
- [backend-api/src/models/platformAccountModel.ts](D:/projects/chatbot/backend-api/src/models/platformAccountModel.ts)
- [backend-api/src/models/platformSettingsModel.ts](D:/projects/chatbot/backend-api/src/models/platformSettingsModel.ts)
- [backend-api/src/controllers/templateController.ts](D:/projects/chatbot/backend-api/src/controllers/templateController.ts)

Meta / WhatsApp integration is driven by:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_VERSION`

The outbound channel adapter is [backend-api/src/connectors/whatsapp/whatsappAdapter.ts](D:/projects/chatbot/backend-api/src/connectors/whatsapp/whatsappAdapter.ts), and the runtime message serializer is [backend-api/src/services/messageRouter.ts](D:/projects/chatbot/backend-api/src/services/messageRouter.ts).

## 14. Existing Companion Docs

This file complements the repo's existing documentation:

- [docs/system-architecture.md](D:/projects/chatbot/docs/system-architecture.md)
- [docs/database-schema.md](D:/projects/chatbot/docs/database-schema.md)
- [docs/FINAL_MASTER_SYSTEM_SPEC.md](D:/projects/chatbot/docs/FINAL_MASTER_SYSTEM_SPEC.md)
- [docs/INDUSTRIAL_STANDARD_GAP_ANALYSIS.md](D:/projects/chatbot/docs/INDUSTRIAL_STANDARD_GAP_ANALYSIS.md)
- [docs/RUNTIME_FLOW_DIAGRAM_AND_SEQUENCE_MAP.md](D:/projects/chatbot/docs/RUNTIME_FLOW_DIAGRAM_AND_SEQUENCE_MAP.md)
- [docs/OPERATOR_CHEAT_SHEET.md](D:/projects/chatbot/docs/OPERATOR_CHEAT_SHEET.md)
- [docs/message-flow.md](D:/projects/chatbot/docs/message-flow.md)
- [docs/connector-flow.md](D:/projects/chatbot/docs/connector-flow.md)
- [docs/engine-flow.md](D:/projects/chatbot/docs/engine-flow.md)
- [docs/campaign-capture-architecture.md](D:/projects/chatbot/docs/campaign-capture-architecture.md)

## 15. Bottom Line

The platform is a multi-tenant, workspace/project-scoped chatbot system with:

- Postgres as the source of truth for runtime state
- Redis used as a supporting runtime dependency
- Node/Express as the backend API
- Next.js/React Flow as the flow-builder frontend
- a loop-based flow engine
- exact-match keyword routing
- button-based confirmation prompts
- queue-backed timeout and reminder recovery
