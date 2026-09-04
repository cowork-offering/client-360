# Observed tool shapes: the memo writeback (2026-09-04)

One real call per tool, from a session holding both connectors, against the DISPOSABLE test package
(`a5Fbb0000001C0jEAE`, account `001Dz00002sECVFIA4`), acting user `005bb00000ftouDAAQ`. Never against
Hartwell or Piedmont.

**Shapes only.** No observed VALUE is carried into code or fixtures: the lanes read these keys, and
the tests answer in these shapes with invented values.

## The finding that matters: both write connectors answered from FIXTURES

Every nCino tool answered with `_source: "NCINO-FIXTURE"`, most of them with `simulated: true`, and
AFS answered with a `WP-FIXTURE-*` id and a `(fixture)` note. They report the write, name plausible
record ids, and change nothing.

Read back over REST immediately afterwards (`LLC_BI__Product_Package__c a5Fbb0000001C0jEAE`):

- `cm_Credit_Stage__c` null, `LLC_BI__Stage__c` null, `LastModifiedDate` unchanged at 2026-02-13.
- `cm_Deal_Summary_Loan__c`, `cm_Risk_Analysis_Loan__c`, `cm_Background_Loan__c` all null.
- No `nFORMS__Form_Template__c` by the published name exists.
- `ProcessInstance` where `TargetObjectId = a5Fbb0000001C0jEAE`: zero rows.

The three Snowflake ledger tools ARE live (`_source: "snowflake"`): the decision written by this
observation reads back through `recall_decisions`.

This is why every lane carries `simulated` and the publication carries the roll-up: a room that
renders a fixture answer as "published" tells a banker something untrue about the system of record.

## Experience / nCino

### ncino_sync_memo_sections (WRITE)
- request: `{ packageId: string, sections: { <sectionId>: html }, actingUserId: string, actingUserName: string }`
- response: `{ _source, ok: boolean, simulated?: boolean, packageId: string, mapped: [{ section, field, chars }], unmapped: [], truncated: [], syncedBy: string, message: string }`
- section ids echoed back with the `cm_*` field the connector owns the map to.

### ncino_publish_credit_memo (WRITE)
- request: `{ packageId, html, templateName?, actingUserId, actingUserName }`
- response: `{ _source, ok, simulated?, templateCreated: boolean, templateId: string, templateName: string, attachmentId: string, packageId, bytes: number, publishedBy: string, generateUrl: string, message }`
- `generateUrl` is an absolute Salesforce URL (`/apex/nFORMS__HtmlFormGenerator?contextId=<packageId>&parentId=<templateId>`). It is what the trail row links to.

### ncino_finalize_credit_memo (WRITE)
- request: `{ packageId, packageStage?, actingUserId, actingUserName }`
- response: `{ _source, ok, packageId, sectionsSynced: number, fields: string[], packageStage: string, finalizedBy: string, audited: boolean, message }`
- carries no `simulated` key even in fixture mode: `_source` is the only marker, which is why the
  fixture check reads both.

### ncino_submit_for_approval (WRITE)
- request: `{ packageId, approverEmails: string[], notificationEmails: string[], comments, actingUserId, actingUserName }`
- response: `{ _source, ok, packageId, newStage: string, submittedBy: string, comments: string, processInstanceId: string, notified: string[], message }`
- no `queue` key travels, so the publication's `approval.queue` stays undefined rather than being
  filled with a queue name nothing observed.

### ncino_notify (WRITE, email)
- request: `{ packageId, to: string[], subject?, body?, actingUserId, actingUserName }`
- response: `{ _source, ok, to: string[], subject, body, sentBy, packageId, message }`

### record_decision (WRITE, Snowflake, LIVE)
- request: `{ packageId, sectionId?, decision, rationale, alternatives?, actingUserId, actingUserName }`
- response: `{ _source: "snowflake", _provenance: { system, record }, recorded: { packageId, borrowerId, sectionId, decision, rationale, alternatives, actorName, actorId, occurredAt } }`
- NO `ok` key. Success is read off `recorded.occurredAt`.

### log_audit_event (WRITE, Snowflake, LIVE)
- request: `{ packageId, sectionId?, eventType, fieldOrStatus?, oldValue?, newValue?, actingUserId, actingUserName }`
- response: `{ _source, _provenance, logged: { packageId, borrowerId, sectionId, eventType, fieldOrStatus, oldValue, newValue, actorName, actorId, occurredAt } }`
- same doctrine: no `ok`, success is `logged.occurredAt`.

### recall_decisions (READ, Snowflake, LIVE)
- request: `{ packageId, sectionId? }`
- response: `{ _source, _provenance, packageId, count: number, decisions: [{ packageId, sectionId, decision, rationale, alternatives, actorName, actorId, occurredAt }] }`
- `occurredAt` comes back in the ledger's own local format on the read, and as an ISO instant on the
  write. Never compare the two as strings.

### deal_covenant_grade (READ)
- request: `{ packageId?, covenants?: [{ typeName, operator, threshold, actual, unit?, ratioKey?, frequency? }] }`
- response: `{ _source, _provenance, rows: [{ id, typeName, operator, frequency, ratioKey, threshold, actual, unit, formattedThreshold, formattedActual, headroomPct, status }], worstStatus }`
- in fixture mode it answers with the fixture package's covenants whatever `packageId` is passed.

## AFS

### loan_summary (READ)
- request: `{ bank, obligor, obligation, supportingObligor?, supportingCollateralItem?, supportedApplication? }`
- response: `{ key: { bank, obligor, obligation }, borrower: { name, type, status, salesVolume, currency, reviewDate, probabilityOfDefault }, facilities: [{ application, type, totalDirect, prinBalCurrentDirect, futureDirect, obligationcurrencyCode }], terms: { product, purpose, secured, commitment, legalMaturityDate, rate, accrualStatus, performing, loanToValue }, outstanding: { balanceType, amount, currency, asOf }, balanceCodes: [{ code, amount }], collateral: [{ item, type, description, currentValue, netUseableValue, advancePercent }], guaranties: [], warnings: string[] }`
- `warnings` carries the tool's own sentence about what it did not fetch. Rendered verbatim.

### payment_history (READ)
- request: `{ bank, obligor, obligation, obligationId?, effectiveFrom? }`
- response: `{ key: { bank, obligor, obligation, obligationId }, status: { currentDaysPastDue, timesPastDue, returnedCheckCount, nextDueDate, firstDelinquencyDate, principalPastDue, principalBilledNotPaid, performing, finalClose }, agingBuckets: { "30", "60", "90", "120", "150" }, events: [{ date, type, amount }], ledgerTransactions: number, notes: string[] }`

### revolver_utilization (READ)
- request: `{ bank, obligor, obligation, obligationId?, effectiveFrom?, effectiveTo?, includeLedger? }`
- response: `{ key, commitment, drawn, unused, utilizationPercent, balanceCodes: [{ code, amount, asOf }] }`

### create_workpackage (WRITE)
- request: `{ workflow: "origination" | "postApproval", bank?, obligorNumber?, officer?, assignmentUnit?, description?, facilities: [{ name, amount, currency?, revolvingType?, maturityDate?, effectiveDate?, ... }] }`
- response: `{ workpackageId: string, workflow: string, obligor: string, officer: string, facilities: [{ amount, product }], messages: [{ severity, text }], submittedPayload: { ...the whole AFS deal envelope... } }`
- NO `ok` key: success is a `workpackageId` with no `severity: "error"` message.
- **Every input defaults**, including the key. Called with no `bank`/`obligorNumber` it stages the
  workpackage against the AFS SAMPLE obligor, which is a real and different borrower. That is why
  `afsMapping.ts` refuses a partial mapping and the servicing lane skips rather than defaults.

## The transport caveat

These shapes were observed through THIS session's tool bridge, where each tool's JSON arrives whole.
The ARTIFACT bridge (`window.claude.mcp.callTool`) has not been observed carrying one of these
connectors' results, so `unwrapJson` in `app/src/channel/mcp.ts` reads the three places the runtime
contract allows a result to live (`payload`, `structuredContent`, a single JSON text block) rather
than assuming the first.
