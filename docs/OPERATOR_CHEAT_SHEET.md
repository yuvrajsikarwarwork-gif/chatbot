# Operator Cheat Sheet

Last updated: 2026-04-03

This is the short version for day-to-day debugging. Use it when you need to answer: "Why did the bot do that?"

## 1. First Things To Check

1. `current_node` on the conversation row
2. `status` on the conversation row
3. `flow_id` on the conversation row
4. `context_json.trigger_confirmation_pending`
5. `context_json.bookmarked_state`
6. whether the inbound text matched a trigger keyword exactly
7. whether the flow is waiting for input

## 2. Key Runtime Files

- [backend-api/src/services/flowEngine.ts](D:/projects/chatbot/backend-api/src/services/flowEngine.ts)
- [backend-api/src/services/flowTriggerRouterService.ts](D:/projects/chatbot/backend-api/src/services/flowTriggerRouterService.ts)
- [backend-api/src/services/flowConfirmationHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowConfirmationHandlerService.ts)
- [backend-api/src/services/flowInputHandlerService.ts](D:/projects/chatbot/backend-api/src/services/flowInputHandlerService.ts)
- [backend-api/src/services/flowFallbackService.ts](D:/projects/chatbot/backend-api/src/services/flowFallbackService.ts)
- [backend-api/src/controllers/webhookController.ts](D:/projects/chatbot/backend-api/src/controllers/webhookController.ts)
- [backend-api/src/services/messageRouter.ts](D:/projects/chatbot/backend-api/src/services/messageRouter.ts)

## 3. Common Symptoms

### A. User types random text while on an input node

Expected:

- trigger scan is skipped
- input handler consumes the reply

Check:

- `current_node`
- input node type
- whether the input handler advanced to the next node

### B. User sees a Yes / No confirmation

Expected:

- the bot is interrupting an active flow because a trigger matched

Check:

- `trigger_confirmation_pending`
- `bookmarked_state`
- whether the confirmation buttons were rendered

### C. User is stuck after timeout

Expected:

- confirmation timeout should restore the bookmarked flow

Check:

- `flow_confirmation_timeout` queue jobs
- confirmation timeout processor running in `server.ts`

### D. Bot sends fallback instead of launching a flow

Expected:

- no exact trigger matched
- no active input node was locked
- no confirmation was pending

Check:

- stored trigger keywords
- campaign handoff keywords
- `botSettingsService.findBotUniversalRuleMatch(...)`

### E. WhatsApp message sent but conversation did not advance

Expected:

- `executeFlowFromNode(...)` should update `current_node` or end the session cleanly

Check:

- flow edges
- node type
- `retry_count`
- whether the node is waiting-type and scheduled a reminder/timeout

## 4. Logs That Matter

Useful log patterns in the backend:

- `Trigger Matched`
- `Shield CLOSED`
- `natural_close`
- `ENGINE ERROR`
- `Campaign channel lookup failed`
- `Webhook`
- `Processed workspace export jobs`
- `Processed campaign automation rules`

## 5. Fast Debug Checklist

1. Find the conversation row.
2. Read `current_node`, `flow_id`, `status`, and `context_json`.
3. Confirm whether the incoming text is a trigger keyword or an input reply.
4. Check whether the engine was in the locked input path.
5. Check whether confirmation was pending.
6. Check whether the node graph has the edge you expected.
7. Check whether the outbound adapter supports the message type you expected.

## 6. Reset / Recovery Rules

- `end` node means idle, not closed.
- `end` / `exit` command means intentional kill.
- `reset` / `restart` should restore flow state.
- `continue` should restore a bookmarked confirmation state if one exists.

## 7. When To Look At The Database

Always check Postgres first if:

- the wrong flow launched
- the bot stayed stuck at one node
- a confirmation did not expire
- the wrong workspace or project was used
- messages were sent but the session did not move

## 8. One-Line Mental Model

`Webhook -> resolve context -> choose conversation -> check lock/confirmation/trigger -> run flow -> persist runtime state -> send message`

