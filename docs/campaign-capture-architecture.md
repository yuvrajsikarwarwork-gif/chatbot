# Campaign-Centric Lead Capture Architecture

## Core hierarchy

Campaign
-> Campaign Channel / Platform
-> Entry Point
-> Flow
-> Flow Nodes
-> Lead Form Node
-> Lead Save
-> Lead List / Source

## Database model

### campaigns

- Top-level tenant-owned marketing container
- Holds campaign name, slug, lifecycle status, and metadata

### campaign_channels

- Belongs to a campaign
- Represents a platform instance inside the campaign
- Stores `bot_id`, `platform`, optional `default_flow_id`, and platform config

### entry_points

- Belongs to a campaign and a campaign channel
- Each entry point maps one source trigger to one flow
- Stores `entry_key`, `entry_type`, `source_ref`, `landing_url`, `flow_id`, and optional `list_id`

### flows

- Reusable bot logic
- Does not store campaign id directly
- Receives campaign context from the conversation resolved by entry point

### flow_nodes

- Normalized node inventory per flow
- Supports runtime inspection, analytics, audits, and future migration tooling

### lists

- Tenant-owned lead lists
- System-generated lists can be created per campaign/platform/entry point
- Manual lists can be added later for segmentation

### leads

- Stores the captured lead with full lineage:
  - `campaign_id`
  - `channel_id`
  - `entry_point_id`
  - `flow_id`
  - `platform`
  - `list_id`

### conversations

- Stores resolved runtime context:
  - `campaign_id`
  - `channel_id`
  - `entry_point_id`
  - `flow_id`
  - `list_id`
  - `context_json`

## Relations

- `campaigns.user_id -> users.id`
- `campaign_channels.campaign_id -> campaigns.id`
- `campaign_channels.bot_id -> bots.id`
- `campaign_channels.default_flow_id -> flows.id`
- `entry_points.campaign_id -> campaigns.id`
- `entry_points.channel_id -> campaign_channels.id`
- `entry_points.bot_id -> bots.id`
- `entry_points.flow_id -> flows.id`
- `entry_points.list_id -> lists.id`
- `lists.campaign_id -> campaigns.id`
- `lists.channel_id -> campaign_channels.id`
- `lists.entry_point_id -> entry_points.id`
- `leads.contact_id -> contacts.id`
- `leads.campaign_id -> campaigns.id`
- `leads.channel_id -> campaign_channels.id`
- `leads.entry_point_id -> entry_points.id`
- `leads.flow_id -> flows.id`
- `leads.list_id -> lists.id`
- `conversations.campaign_id -> campaigns.id`
- `conversations.channel_id -> campaign_channels.id`
- `conversations.entry_point_id -> entry_points.id`
- `conversations.flow_id -> flows.id`
- `conversations.list_id -> lists.id`

## Runtime flow logic

1. An inbound message arrives from WhatsApp, website, or a future platform.
2. The platform adapter resolves an `entryKey` when possible.
3. The backend resolves campaign context from:
   - `bot_id`
   - `platform`
   - `entry_key`
   - default entry point fallback
4. A conversation is created or updated with campaign context.
5. Flow selection happens from `conversation.flow_id` rather than from campaign data stored inside the flow.
6. Flow execution stays reusable across campaigns.
7. A `lead_form` node captures and upserts a lead using:
   - conversation context
   - contact identity
   - mapped variables like `name`, `phone`, `email`
8. The lead lands in the correct campaign/platform/entry/list bucket.

## Lead save logic

The `lead_form` node:

- Reads variable mappings like `nameVariable`, `phoneVariable`, and `emailVariable`
- Pulls resolved context from the current conversation
- Upserts a lead by contact + campaign + channel + entry point
- Stores:
  - `campaign_id`
  - `channel_id`
  - `entry_point_id`
  - `flow_id`
  - `platform`
  - `list_id`
  - `name`
  - `phone`
  - `email`
  - `status`
  - `source`
  - `source_payload`
  - `variables`

## SaaS scaling rules

- Every query is tenant-scoped through `user_id`
- Campaigns are the tenancy-safe top-level domain object for acquisition
- Flows remain reusable and do not hardcode campaign ids
- Entry points are the switchboard for routing the same campaign across many platforms
- Lists are generated per source so lead segmentation stays cheap and queryable
- Context is stored once on conversations and reused by downstream events
- Lead filters are indexed on:
  - `campaign_id`
  - `platform`
  - `channel_id`
  - `entry_point_id`
  - `flow_id`
  - `list_id`

## Example data

```sql
INSERT INTO campaigns (id, user_id, name, slug, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'user-1', 'Summer Launch', 'summer-launch', 'active');

INSERT INTO campaign_channels (id, campaign_id, user_id, bot_id, platform, name)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'user-1', 'bot-1', 'whatsapp', 'WA Ads');

INSERT INTO entry_points (id, campaign_id, channel_id, user_id, bot_id, flow_id, platform, name, entry_key, entry_type)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'user-1', 'bot-1', 'flow-1', 'whatsapp', 'Click To WhatsApp Ad', 'wa-ad-01', 'ad');

INSERT INTO lists (id, user_id, bot_id, campaign_id, channel_id, entry_point_id, platform, name, list_key)
VALUES ('44444444-4444-4444-4444-444444444444', 'user-1', 'bot-1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'whatsapp', 'WhatsApp / Click To WhatsApp Ad', 'summer-launch__whatsapp__wa-ad-01');

INSERT INTO leads (id, user_id, bot_id, campaign_id, channel_id, entry_point_id, flow_id, platform, list_id, name, phone, email, status)
VALUES ('55555555-5555-5555-5555-555555555555', 'user-1', 'bot-1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'flow-1', 'whatsapp', '44444444-4444-4444-4444-444444444444', 'Aarav Sharma', '+919999999999', 'aarav@example.com', 'captured');
```

## API structure

### Campaign APIs

- `GET /api/campaigns`
- `GET /api/campaigns/:id`
- `POST /api/campaigns`
- `PUT /api/campaigns/:id`
- `DELETE /api/campaigns/:id`

### Campaign channel APIs

- `POST /api/campaigns/channels`
- `PUT /api/campaigns/channels/:id`
- `DELETE /api/campaigns/channels/:id`

### Entry point APIs

- `POST /api/campaigns/entries`
- `PUT /api/campaigns/entries/:id`
- `DELETE /api/campaigns/entries/:id`

### List APIs

- `POST /api/campaigns/lists`
- `PUT /api/campaigns/lists/:id`
- `DELETE /api/campaigns/lists/:id`

### Lead APIs

- `GET /api/leads`
  - supports `campaignId`, `channelId`, `entryPointId`, `flowId`, `listId`, `platform`, `status`, `botId`, `search`
- `GET /api/leads/lists`
- `GET /api/leads/:id`
- `DELETE /api/leads/:id`

## Files implemented in this repo

- Database migration foundation: `database/migrations/012_create_campaign_capture_architecture.sql`
- Campaign APIs: `backend-api/src/routes/campaignRoutes.ts`
- Lead APIs: `backend-api/src/routes/leadRoutes.ts`
- Campaign runtime context: `backend-api/src/services/campaignContextService.ts`
- Lead capture runtime: `backend-api/src/services/leadCaptureService.ts`
- Flow engine integration: `backend-api/src/services/flowEngine.ts`
- Campaign management UI: `frontend-dashboard/pages/campaigns.tsx`
- Lead filtering UI: `frontend-dashboard/pages/leads.tsx`
