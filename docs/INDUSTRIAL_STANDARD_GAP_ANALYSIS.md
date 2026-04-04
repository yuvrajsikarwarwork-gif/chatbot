# Industrial Standard Gap Analysis

Last updated: 2026-04-03

This document compares the current chatbot platform, as implemented in the repository, against common industrial standards for multi-tenant messaging platforms, workflow engines, and support operations.

It is intentionally opinionated. Items marked as "gap" are not necessarily defects, but they are places where the current implementation is below the maturity level commonly expected in a hardened production system.

## 1. Executive View

### Strong areas

- clear workspace and project separation
- queue-backed runtime jobs for reminders, timeouts, and broadcasts
- button-based confirmation for trigger interruptions
- explicit webhook verification and internal trigger protection
- modularized engine helpers for confirmation, input, fallback, and runtime state
- builder support for a broad node catalog
- strict exact-match universal trigger routing

### Main gaps versus industrial standards

- the runtime engine is still large and mostly imperative instead of being split into a formally versioned orchestration layer plus node executors
- shared validation between backend and frontend is not yet a single canonical package
- observability is present but not yet at a full production SRE standard
- there is no evidence of row-level security or database-enforced tenant isolation
- there is no visible dead-letter / poison-message strategy for every queue class
- some legacy compatibility branches still exist because the platform has evolved through multiple schema eras
- operator tooling exists, but there is still room for a true incident console, replay tooling, and traceable flow version history

## 2. Architecture Standards

### What is already aligned

- backend and frontend are separated cleanly
- worker-style background processing exists
- channel adapters are isolated from the core engine
- queue-backed asynchronous jobs are used for non-blocking runtime work
- runtime state is persisted outside memory

### Gaps

1. Flow engine remains a large orchestration file.
2. Several helper services are still coupled through direct calls instead of a stricter domain interface.
3. Flow schema, node normalization, and validation logic are duplicated between the dashboard and runtime.
4. There is no visible shared package that acts as the authoritative flow AST / node contract for both UI and runtime.

### Industrial standard target

- a small orchestrator
- a separate engine runtime package
- a shared contract package for nodes, edges, and flow schema
- versioned flow definitions with migration support

## 3. Reliability and Resilience

### What is already aligned

- confirmation interruption is backed by persistence
- flow wait and confirmation timeout jobs are queue-driven
- message routing is idempotency-aware in the send path
- conversation state is persisted in Postgres, not memory

### Gaps

1. There is no explicit dead-letter strategy documented for failed queue jobs.
2. Retry policy is visible in some jobs but not as a single platform-wide standard.
3. There is no visible replay console for failed inbound events or failed runtime jobs.
4. The system relies on multiple cron and queue entry points that should be monitored together as one operational surface.
5. Recovery after partial failure still depends on reading state from several tables and helper paths rather than a single event ledger.

### Industrial standard target

- poison-message handling
- retry / backoff policy by job family
- dead-letter dashboard
- replayable inbound event ledger
- health probes for queue workers and webhook processors

## 4. Multi-Tenancy And Security

### What is already aligned

- workspace and project scoping is a first-class design choice
- most core queries filter by workspace/project where appropriate
- soft-delete checks are used in several runtime paths
- internal trigger flow endpoint is guarded by a secret
- webhook verification token support exists
- support access is explicit and time-bounded

### Gaps

1. Database-enforced tenant isolation is not visible in the current schema as row-level security.
2. Some compatibility paths still allow broad fallback lookups during migration phases.
3. Scoping is mainly enforced in application logic, which is correct but easier to regress than database policy enforcement.
4. Secret rotation appears supported for integration secrets, but there is no visible secrets lifecycle policy in the repo.
5. There is no visible policy layer proving least-privilege access for every read path.

### Industrial standard target

- RLS or equivalent database-enforced tenancy
- least-privilege service accounts
- centralized authorization middleware for every read/write family
- audited secret rotation lifecycle

## 5. Observability

### What is already aligned

- request IDs are attached in the backend app
- webhook and engine branches log important transitions
- queue processors are isolated as named services
- dashboard update events exist for real-time UI refresh

### Gaps

1. No full tracing story is visible across webhook -> engine -> queue -> adapter.
2. Metrics are not documented as a first-class runtime contract.
3. Structured logging standards are inconsistent across services.
4. There is no visible SLO / error-budget instrumentation.
5. There is no operator dashboard in the repository that ties logs, queue status, runtime state, and conversation context together.

### Industrial standard target

- distributed tracing
- structured logs with stable event names
- queue depth / failure metrics
- runtime state inspection tooling
- alerting on stuck conversations and stalled jobs

## 6. Flow Builder And Runtime Schema

### What is already aligned

- the builder supports a broad real-world node library
- start / trigger / resume_bot root nodes are supported
- the runtime can traverse the major node classes
- message types are translated cleanly into channel-specific outputs

### Gaps

1. The builder and runtime do not yet appear to consume a single shared flow schema package.
2. Node semantics are normalized in more than one place.
3. There is no visible formal schema versioning for flows.
4. Runtime branch handling is still assembled in a large loop rather than generated from node executors.
5. Validation rules live primarily in the dashboard and should be mirrored by backend schema validation in a shared contract.

### Industrial standard target

- shared schema package
- flow versioning
- migration tool for flow definitions
- runtime validation at the API boundary and again at execution time

## 7. Messaging And Channel Integration

### What is already aligned

- WhatsApp webhook ingestion is supported
- template, list, button, and media messages are supported
- connector adapters are separated from the engine
- internal send-path logic stores message metadata and delivery status

### Gaps

1. The supported channel matrix is still mostly WhatsApp-centric.
2. Inbound normalization appears platform-specific rather than fully abstracted.
3. The outbound adapter contract is not visibly enforced by a shared interface package.
4. There is no visible simulator for channel-specific payloads.

### Industrial standard target

- channel abstraction layer
- canonical normalized inbound event model
- adapter interface contract tests
- payload simulators for Meta / email / website connectors

## 8. Operations And Support

### What is already aligned

- support access exists
- agent sessions and activity tables exist
- conversation assignment and human handoff are modeled
- support surveys and conversation notes are present

### Gaps

1. There is no visible incident console or playbook-driven support workspace.
2. There is no built-in “replay the exact inbound event” tool.
3. Human takeover and automation coexist, but the operator control plane could be clearer.
4. There is no visible operational health page that combines queue status, webhook health, and worker health.

### Industrial standard target

- incident console
- replay / reprocess tool
- support workspace with scoped operator permissions
- runtime health dashboard

## 9. Prioritized Gap List

### P0

- add a replayable inbound event ledger
- add dead-letter handling and failure visibility for queue jobs
- add a shared flow schema package

### P1

- split the remaining runtime orchestration into a smaller engine core plus node executors
- add structured logging and tracing standards
- add stronger tenant enforcement at the database boundary

### P2

- add a flow version history and migration model
- add an operator incident console
- add adapter contract tests for each connector

## 10. Bottom Line

The platform is already well past a prototype. It is structurally close to a production-grade multi-tenant chatbot system. The biggest remaining differences from industrial standards are:

- stronger observability
- stronger data-plane enforcement
- shared schema/version contracts
- replay and incident tooling
- queue failure handling and operator controls

