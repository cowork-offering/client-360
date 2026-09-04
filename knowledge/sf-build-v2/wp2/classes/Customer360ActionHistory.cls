/**
 * Customer360ActionHistory - MCP tool: the durable audit trail for Action Panel activity.
 *
 * Read-only. Zero DML. This tool answers "what has the cockpit done on this relationship, and did
 * it land", from the staging store that A33.3.3 makes the authority on tracker state. The client's
 * sessionStorage copy is a cache and dies with the session; this survives it.
 *
 * TWO THINGS THIS TOOL DELIBERATELY DOES NOT RETURN:
 *   1. `cm_Decision_Token_Hash__c` is never selected. Not redacted, not blanked, not selected at
 *      all, so no token material can reach a caller even through an unexpected serialisation path.
 *   2. The plan hash itself is never emitted. A33.5.3 makes the hash the binding between a
 *      confirmed plan and its execution; a reader needs to know one EXISTS, not what it is, so
 *      this returns `planHashPresent` as a boolean.
 *
 * THE EXECUTED CHANGES (2026-09-04, the credit memo room's org read). A memo has to state what was
 * done on the relationship, to any viewer, at any later time. That answer cannot come from the
 * banker's browser: the session that filed the change is long gone by the time the memo is read,
 * and a memo built from a client-side echo would be a memo built from memory. It comes from here.
 * A Completed or Partial row now carries `steps`, one entry per plan step, composed from the two
 * long-text fields on the staging record:
 *   - `cm_Plan_JSON__c` is the plan the banker CONFIRMED. Its `values` map holds the per-facility
 *     resolved figures the plan hash covers, which is where a step's target, field and staged value
 *     come from. Its `summary` is the plan's own banker-language sentence and is returned verbatim.
 *   - `cm_Tracker_JSON__c` is the same step list carrying what EXECUTION made of it: the final
 *     state and the `detail` sentence the execute tool wrote when it re-read the org. That sentence
 *     is what `verification` returns, because a memo needs the proof in words rather than the SOQL
 *     that produced it; where a step never executed, the plan's own verification query stands in.
 * A record id named in that sentence is surfaced as `orgRecordId`, so a reader can open the thing
 * that was created rather than read about it. Only 18-character ids are lifted, because Apex
 * validates their checksum and a 15-character match would accept any word of that length.
 *
 * `field`, `before` and `after` ARE FILLED FROM THE INDEXED ARMS ONLY, and never inferred. A
 * package-anchored plan keys its values per arm (`fieldChange0.field`, `covenantAdd1.threshold`)
 * and every step id ends in that same index, so the join is exact. Every other action writes a FLAT
 * values map holding the fields of the ONE record it creates, and a build of this tool that matched
 * a flat step declaring a single field against that map reported the new-facility action's
 * "Move the facility from Qualification to Proposal" step with an `after` of Qualification: the
 * value the CREATE step wrote, presented as the value the HOP wrote. Caught on the first live call
 * (2026-09-04). A flat plan therefore returns its steps with their labels and their verification
 * and no field values at all, which is the true answer.
 *
 * WHY THE STEPS ARE GATED. The cockpit reads this trail on every Activity tab render and wants it
 * light. The memo room reads it once and wants everything. So the plan and tracker are read only
 * for rows that executed, and for rows older than RECENT_DAYS only when the caller asks with
 * `includeSteps`. `productPackageId` narrows the trail to one deal, and because a modification
 * files its plan against the package the banker started from while the memo is written against the
 * VERSION that came out of it, the filter walks the loan renewal chain and accepts either.
 *
 * SHARING, STATED PLAINLY. cm_Action_Staging__c is Private with the acting banker as owner, and
 * this class is `with sharing` running WITH USER_MODE. A banker therefore sees their own actions
 * and not a colleague's. That is correct for a cockpit surface and INSUFFICIENT for supervisory
 * review or examiner export, which need a sharing rule or View All on the object. The note on the
 * response says so rather than letting an empty list read as "nothing happened".
 *
 * Pattern follows the existing Customer360* read tools exactly: global with sharing, one
 * @InvocableMethod, positional List<Response>, global inner wire types, WITH USER_MODE, API 67.
 */
global with sharing class Customer360ActionHistory {

    private static final Integer DEFAULT_LIMIT = 50;
    private static final Integer MAX_LIMIT = 200;

    /**
     * Steps returned per row. A modification over four facilities carrying covenants, fees, pledges
     * and a policy exception plans in the low forties; sixty leaves that whole shape intact without
     * letting one pathological plan own the response.
     */
    private static final Integer MAX_STEPS_PER_ROW = 60;

    /**
     * The step payload for the WHOLE response, in characters. Steps are the only unbounded thing
     * this tool emits: everything else is a handful of ids per row. Once the budget is spent the
     * remaining rows come back without steps and the note says so, which is the honest shape - a
     * truncated trail that admits it beats a complete one that blows the tool's response limit.
     */
    private static final Integer STEPS_CHAR_BUDGET = 120000;

    /**
     * Rows whose plan and tracker are read at all. Both are long text; twenty-five of them is the
     * heap bound, and it sits above the number of actions any one deal accumulates.
     */
    private static final Integer MAX_STEP_ROWS = 25;

    /** Steps ride an unasked-for row only while it is this recent. Older rows need includeSteps. */
    private static final Integer RECENT_DAYS = 90;

    /** Hops of the loan renewal chain walked to find a package's other versions. */
    private static final Integer PACKAGE_VERSION_HOPS = 3;

    /** The four scalars a modification broadcasts, and the loan fields they land on. */
    private static final Map<String, String> SCALAR_FIELDS = new Map<String, String>{
        'requestedAmount' => 'LLC_BI__Amount__c',
        'requestedMaturityDate' => 'LLC_BI__Maturity_Date__c',
        'requestedRate' => 'LLC_BI__InterestRate__c',
        'requestedTermMonths' => 'LLC_BI__Term_Months__c'
    };

    /**
     * The two pricing prerequisites. nCino refuses a payment schedule without them, so a plan that
     * moves a commitment or a term carries them whether or not the banker asked for them by name.
     */
    private static final Set<String> PRICING_PREREQUISITES = new Set<String>{
        'LLC_BI__Amortized_Term_Months__c',
        'LLC_BI__First_Payment_Date__c'
    };

    /** An 18-character id inside a tracker sentence. 15-character ids are not lifted: Apex cannot
     *  checksum them, so any word of that length would pass. */
    private static final Pattern RECORD_ID = Pattern.compile('\\b[a-zA-Z0-9]{18}\\b');

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
        @InvocableVariable(label='Max Results' description='Default 50, max 200. Newest first.')
        global Integer maxResults;
        @InvocableVariable(label='Include Steps' description='Default false. Executed rows within the last 90 days always carry their steps; set this to true to get them on older rows too. The credit memo room asks with it set, because a memo states what was done however long ago it was done.')
        global Boolean includeSteps;
        @InvocableVariable(label='Product Package Id' description='Optional. Narrows the trail to one deal. A modification stages against the package the banker started from and produces a NEW version, so this accepts either end: the loan renewal chain is walked and every version of the named package matches.')
        global String productPackageId;
    }

    /**
     * One step of an executed plan, as it was confirmed and as the org read it back.
     *
     * `before` and `after` are populated only where the plan itself holds the value. An add carries
     * an `after` and no `before`; a carry exclusion carries a `before` and no `after`, because
     * nothing is deleted on a modification and the removal IS the absence. A step whose plan holds
     * neither carries the story in its `label`.
     */
    global class ActionStep {
        @InvocableVariable(label='Step Id')
        global String id;
        @InvocableVariable(label='Type' description='write, verification, wait, handoff or observed_side_effect.')
        global String type;
        @InvocableVariable(label='Label' description='The banker-language description of this step, as it was confirmed.')
        global String label;
        @InvocableVariable(label='Object' description='The object this step writes or reads. Null on a step that touches none.')
        global String objectName;
        @InvocableVariable(label='Target Loan Id' description='The facility this step acts on, where the plan names one.')
        global String targetLoanId;
        @InvocableVariable(label='Target Label' description='The org-assigned name of the target facility, or the plan label of a net-new facility that had no id when the plan was written.')
        global String targetLabel;
        @InvocableVariable(label='Field' description='The field API name, where this step sets exactly one named field.')
        global String field;
        @InvocableVariable(label='Before' description='What the plan held as the thing being removed or replaced. Null where the plan holds no prior value.')
        global String before;
        @InvocableVariable(label='After' description='The value the plan staged for this step.')
        global String after;
        @InvocableVariable(label='Verification' description='What the execution proved when it re-read the org. Falls back to the plan verification query on a step that never ran.')
        global String verification;
        @InvocableVariable(label='State' description='pending, waiting, filed_unverified, verified, failed or skipped_not_attempted.')
        global String state;
        @InvocableVariable(label='Org Record Id' description='The record this step created, where the execution named one.')
        global String orgRecordId;
    }

    /**
     * The changes a plan carries, split by who asked for them.
     *
     * `derived` counts the pricing prerequisites the plan added because a commitment or a term
     * moved. They are real writes and a memo must show them, but attributing them to the banker
     * would overstate what was asked for.
     */
    global class ChangeCounts {
        @InvocableVariable(label='Requested')
        global Integer requested;
        @InvocableVariable(label='Derived')
        global Integer derived;
    }

    global class ActionHistoryEntry {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Action Id' description='Registry action id, for example collateral-valuation.')
        global String actionId;
        @InvocableVariable(label='Status' description='Staged, Executing, Completed, Partial or Failed.')
        global String status;
        @InvocableVariable(label='Plan Hash Present' description='True when a plan hash was recorded. The hash itself is never returned by a read tool.')
        global Boolean planHashPresent;
        @InvocableVariable(label='Actor User Id' description='Who staged the action.')
        global String actorUserId;
        @InvocableVariable(label='Approver User Id' description='The named human bound to the decision token. Confirmation of a plan, never a credit approval.')
        global String approverUserId;
        @InvocableVariable(label='Executed At')
        global String executedAt;
        @InvocableVariable(label='Created Date')
        global String createdDate;
        @InvocableVariable(label='Result Record Id' description='The domain record the action created. Empty on a staged-only row, because stage_* creates nothing.')
        global String resultRecordId;
        @InvocableVariable(label='Result Record Name' description='Org-assigned name of the created record. Null when the record type is not one this tool resolves, or when the record is no longer visible.')
        global String resultRecordName;
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Product Package Id')
        global String productPackageId;
        @InvocableVariable(label='Summary' description='The plan own banker-language summary, verbatim. Null on a row whose plan was not read.')
        global String summary;
        @InvocableVariable(label='Steps' description='The executed plan, step by step. Present on Completed and Partial rows only; a Staged row has executed nothing and carries none.')
        global List<ActionStep> steps;
        @InvocableVariable(label='Step Count' description='How many steps the plan holds. Compare with the length of steps to see whether the cap or the response budget trimmed the list. Null when the plan was not read at all.')
        global Integer stepCount;
        @InvocableVariable(label='Change Counts' description='Requested against derived changes. Null on a plan whose shape carries no change counts, which is every action but a modification or a renewal.')
        global ChangeCounts changeCounts;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Count')
        global Integer count;
        @InvocableVariable(label='Entries')
        global List<ActionHistoryEntry> entries;
        @InvocableVariable(label='Note')
        global String note;
    }

    /**
     * Returns the durable action history for a relationship, newest first.
     *
     * @param requests One request per relationship. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='Customer 360: Action History'
        description='Durable audit trail of Action Panel activity for a relationship: which actions were staged, which executed, by whom, and what record each produced. An executed row carries its plan step by step, with the target facility, the staged value and what the org read back, so a credit memo can state exactly what was done on the relationship long after the session that did it. Read-only. Never returns decision-token material and never returns the plan hash itself.'
    )
    global static List<Response> getHistory(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.entries = new List<ActionHistoryEntry>();

            if (String.isBlank(req.accountId)) {
                res.count = 0;
                res.note = 'accountId is required. No history was read.';
                results.add(res);
                continue;
            }

            Integer lim = req.maxResults == null ? DEFAULT_LIMIT : Math.min(Math.max(req.maxResults, 1), MAX_LIMIT);
            Boolean includeSteps = req.includeSteps == true;

            Set<Id> packageFilter = null;
            if (String.isNotBlank(req.productPackageId)) {
                Id seed = null;
                try {
                    seed = Id.valueOf(req.productPackageId);
                } catch (System.StringException e) {
                    res.count = 0;
                    res.note = 'productPackageId ' + req.productPackageId + ' is not a record id, so no trail was read. ' +
                        'Send the package id, or omit it for the whole relationship.';
                    results.add(res);
                    continue;
                }
                packageFilter = packageVersions(seed);
            }

            // cm_Decision_Token_Hash__c is absent from this field list on purpose. See the class
            // comment. The plan and tracker long texts are absent too, and read separately below
            // for the rows that need them, so the cockpit's own trail read stays as light as it was.
            List<cm_Action_Staging__c> rows = packageFilter == null
                ? [
                    SELECT Id, cm_Action_Id__c, cm_Status__c, cm_Plan_Hash__c, cm_Actor_User__c,
                           cm_Approver_User__c, cm_Executed_At__c, CreatedDate, cm_Result_Record_Id__c,
                           cm_Account__c, cm_Product_Package__c
                    FROM cm_Action_Staging__c
                    WHERE cm_Account__c = :req.accountId
                    WITH USER_MODE
                    ORDER BY CreatedDate DESC
                    LIMIT :lim
                  ]
                : [
                    SELECT Id, cm_Action_Id__c, cm_Status__c, cm_Plan_Hash__c, cm_Actor_User__c,
                           cm_Approver_User__c, cm_Executed_At__c, CreatedDate, cm_Result_Record_Id__c,
                           cm_Account__c, cm_Product_Package__c
                    FROM cm_Action_Staging__c
                    WHERE cm_Account__c = :req.accountId AND cm_Product_Package__c IN :packageFilter
                    WITH USER_MODE
                    ORDER BY CreatedDate DESC
                    LIMIT :lim
                  ];

            Map<String, String> namesById = resolveNames(rows);
            Map<Id, cm_Action_Staging__c> plansById = readPlans(rows, includeSteps);

            Integer charsSpent = 0;
            Integer rowsWithoutSteps = 0;
            List<ActionStep> needLabel = new List<ActionStep>();

            for (cm_Action_Staging__c r : rows) {
                ActionHistoryEntry e = new ActionHistoryEntry();
                e.stagingId = r.Id;
                e.actionId = r.cm_Action_Id__c;
                e.status = r.cm_Status__c;
                e.planHashPresent = String.isNotBlank(r.cm_Plan_Hash__c);
                e.actorUserId = r.cm_Actor_User__c;
                e.approverUserId = r.cm_Approver_User__c;
                e.executedAt = r.cm_Executed_At__c == null ? null : String.valueOf(r.cm_Executed_At__c);
                e.createdDate = String.valueOf(r.CreatedDate);
                e.resultRecordId = r.cm_Result_Record_Id__c;
                e.resultRecordName = namesById.get(r.cm_Result_Record_Id__c);
                e.accountId = r.cm_Account__c;
                e.productPackageId = r.cm_Product_Package__c;

                cm_Action_Staging__c withPlan = plansById.get(r.Id);
                if (withPlan == null) {
                    if (wantsSteps(r, includeSteps)) {
                        rowsWithoutSteps++;
                    }
                    res.entries.add(e);
                    continue;
                }

                Map<String, Object> doc = planDoc(withPlan.cm_Plan_JSON__c);
                Map<String, Object> values = doc == null ? null : (Map<String, Object>) doc.get('values');
                e.summary = doc == null ? null : asText(doc.get('summary'));
                e.changeCounts = countChanges(values);

                List<C360Plan.Step> tracked = trackedSteps(withPlan, doc);
                if (tracked == null) {
                    res.entries.add(e);
                    continue;
                }
                e.stepCount = tracked.size();

                if (charsSpent >= STEPS_CHAR_BUDGET) {
                    rowsWithoutSteps++;
                    res.entries.add(e);
                    continue;
                }

                e.steps = new List<ActionStep>();
                for (C360Plan.Step s : tracked) {
                    if (e.steps.size() >= MAX_STEPS_PER_ROW || charsSpent >= STEPS_CHAR_BUDGET) {
                        break;
                    }
                    ActionStep step = toStep(s, values);
                    charsSpent += weigh(step);
                    if (String.isNotBlank(step.targetLoanId) && String.isBlank(step.targetLabel)) {
                        needLabel.add(step);
                    }
                    e.steps.add(step);
                }

                res.entries.add(e);
            }

            labelFacilities(needLabel);

            res.count = res.entries.size();
            res.note = note(res.entries, packageFilter, includeSteps, rowsWithoutSteps);
            results.add(res);
        }

        return results;
    }

    /* ---------------------------------------------------------------- the plan read */

    /**
     * Whether a row's plan is worth reading: it executed, and it is either recent or asked for.
     *
     * A Staged row executed nothing, so its plan holds intentions rather than history and a memo
     * would be quoting a decision nobody took. Failed is excluded for the same reason: what it
     * carries is the refusal, which `status` already says.
     *
     * @param r The staging row.
     * @param includeSteps Whether the caller asked for old rows too.
     * @return True when the plan and tracker should be read for this row.
     */
    private static Boolean wantsSteps(cm_Action_Staging__c r, Boolean includeSteps) {
        if (r.cm_Status__c != 'Completed' && r.cm_Status__c != 'Partial') {
            return false;
        }
        return includeSteps || r.CreatedDate >= System.now().addDays(-RECENT_DAYS);
    }

    /**
     * Reads the plan and tracker long texts for the rows that need them, in one query.
     *
     * @param rows The staging rows being returned.
     * @param includeSteps Whether the caller asked for rows older than RECENT_DAYS.
     * @return Staging id to the row carrying its plan and tracker. Empty when nothing qualifies.
     */
    private static Map<Id, cm_Action_Staging__c> readPlans(List<cm_Action_Staging__c> rows, Boolean includeSteps) {
        Set<Id> wanted = new Set<Id>();
        for (cm_Action_Staging__c r : rows) {
            if (wantsSteps(r, includeSteps)) {
                wanted.add(r.Id);
            }
            if (wanted.size() >= MAX_STEP_ROWS) {
                break;
            }
        }
        if (wanted.isEmpty()) {
            return new Map<Id, cm_Action_Staging__c>();
        }
        return new Map<Id, cm_Action_Staging__c>([
            SELECT Id, cm_Plan_JSON__c, cm_Tracker_JSON__c
            FROM cm_Action_Staging__c
            WHERE Id IN :wanted
            WITH USER_MODE
        ]);
    }

    /**
     * Parses the persisted plan, tolerating a row whose plan text is absent or malformed.
     *
     * A read tool never fails a whole relationship over one unreadable row: the entry comes back
     * without its steps and the rest of the trail still answers.
     *
     * @param planJson The JSON written by C360Plan.serializePlan.
     * @return The plan document, or null when it could not be parsed.
     */
    private static Map<String, Object> planDoc(String planJson) {
        if (String.isBlank(planJson)) {
            return null;
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(planJson);
        } catch (System.JSONException e) {
            return null;
        }
    }

    /**
     * The step list to report: the tracker where execution wrote one, the plan otherwise.
     *
     * They are the same ordered list. The tracker is that list after execute_* set every state and
     * wrote its `detail`, which is why it is preferred: it is the plan plus what happened to it.
     *
     * @param row The staging row carrying both long texts.
     * @param doc The parsed plan document.
     * @return The steps, or null when neither source could be read.
     */
    private static List<C360Plan.Step> trackedSteps(cm_Action_Staging__c row, Map<String, Object> doc) {
        try {
            if (String.isNotBlank(row.cm_Tracker_JSON__c)) {
                return (List<C360Plan.Step>) JSON.deserialize(row.cm_Tracker_JSON__c, List<C360Plan.Step>.class);
            }
            if (doc != null && doc.get('steps') != null) {
                return (List<C360Plan.Step>) JSON.deserialize(JSON.serialize(doc.get('steps')), List<C360Plan.Step>.class);
            }
        } catch (System.JSONException e) {
            return null;
        }
        return null;
    }

    /**
     * Maps one plan step onto the wire, filling in what the plan's resolved values know about it.
     *
     * @param s The step, carrying its executed state where it ran.
     * @param values The plan's resolved values, keyed by field API name or by arm index.
     * @return The wire step.
     */
    private static ActionStep toStep(C360Plan.Step s, Map<String, Object> values) {
        ActionStep out = new ActionStep();
        out.id = s.id;
        out.type = s.type;
        out.label = s.label;
        out.objectName = s.objectName;
        out.state = s.state;
        out.verification = String.isNotBlank(s.detail) ? s.detail : s.verification;
        out.orgRecordId = recordIdIn(s.detail);
        describe(out, s, values);
        return out;
    }

    /**
     * Lifts the first 18-character record id out of a tracker sentence.
     *
     * The execute tools name what they created in prose ("Covenant a3X... created", "Facility
     * a4Z... created at Qualification"), so the id is already there and this reads it rather than
     * asking the tools to carry a second copy of it.
     *
     * @param detail The tracker sentence, or null.
     * @return The record id, or null when the sentence names none.
     */
    private static String recordIdIn(String detail) {
        if (String.isBlank(detail)) {
            return null;
        }
        Matcher m = RECORD_ID.matcher(detail);
        while (m.find()) {
            try {
                return String.valueOf(Id.valueOf(m.group()));
            } catch (System.StringException e) {
                continue;
            }
        }
        return null;
    }

    /* ------------------------------------------------------- what the plan holds per step */

    /**
     * Fills a step's target, field and staged value from the plan's resolved values.
     *
     * Every arm of a package-anchored plan indexes its values by position - `fieldChange0.field`,
     * `covenantAdd1.threshold` - and every step id ends in that same index, which is what makes the
     * two joinable. A step with no trailing index belongs to the plan as a whole (rolling the
     * package, verifying it, the booking handoff) and names no single target.
     *
     * @param out The wire step being built.
     * @param s The plan step.
     * @param v The plan's resolved values.
     */
    private static void describe(ActionStep out, C360Plan.Step s, Map<String, Object> v) {
        if (v == null || v.isEmpty() || String.isBlank(s.id)) {
            return;
        }
        String idx = trailingIndex(s.id);
        if (idx == null) {
            return;
        }
        String family = s.id.substring(0, s.id.length() - idx.length());

        switch on family {
            when 'credit_action_', 'verify_clone_' {
                out.targetLoanId = asText(v.get('facility' + idx + '.loanId'));
            }
            when 'apply_changes_' {
                out.targetLoanId = asText(v.get('facility' + idx + '.loanId'));
                applyScalars(out, v);
            }
            when 'field_change_' {
                target(out, v, 'fieldChange' + idx);
                out.field = asText(v.get('fieldChange' + idx + '.field'));
                out.after = decodeJson(asText(v.get('fieldChange' + idx + '.valueJson')));
            }
            when 'covenant_create_', 'covenant_attach_', 'covenant_verify_' {
                target(out, v, 'covenantAdd' + idx);
                out.after = join(new List<String>{
                    asText(v.get('covenantAdd' + idx + '.typeName')),
                    asText(v.get('covenantAdd' + idx + '.operator')),
                    asText(v.get('covenantAdd' + idx + '.threshold'))
                });
            }
            when 'covenant_associate_', 'covenant_associate_verify_' {
                target(out, v, 'covenantAttach' + idx);
                out.after = join(new List<String>{
                    asText(v.get('covenantAttach' + idx + '.covenantName')),
                    asText(v.get('covenantAttach' + idx + '.typeName'))
                });
            }
            when 'involvement_change_', 'involvement_verify_' {
                target(out, v, 'involvement' + idx);
                String party = join(new List<String>{
                    asText(v.get('involvement' + idx + '.role')),
                    asText(v.get('involvement' + idx + '.accountName'))
                });
                // A remove is a carry exclusion: the row exists on the booked facility and simply
                // does not travel. It is a `before` with no `after`, and saying so is the whole
                // point of the pair.
                if (asText(v.get('involvement' + idx + '.op')) == 'remove') {
                    out.before = party;
                } else {
                    out.after = party;
                }
            }
            when 'covenant_exclusion_', 'covenant_exclusion_verify_' {
                target(out, v, 'covenantExclusion' + idx);
                out.before = join(new List<String>{
                    asText(v.get('covenantExclusion' + idx + '.covenantName')),
                    asText(v.get('covenantExclusion' + idx + '.typeName')),
                    asText(v.get('covenantExclusion' + idx + '.threshold'))
                });
            }
            when 'pledge_exclusion_', 'pledge_exclusion_verify_' {
                target(out, v, 'pledgeExclusion' + idx);
                out.before = join(new List<String>{
                    asText(v.get('pledgeExclusion' + idx + '.assetLabel')),
                    asText(v.get('pledgeExclusion' + idx + '.amountPledged'))
                });
            }
            when 'fee_add_', 'fee_verify_' {
                target(out, v, 'feeAdd' + idx);
                out.after = join(new List<String>{
                    asText(v.get('feeAdd' + idx + '.description')),
                    asText(v.get('feeAdd' + idx + '.feeType')),
                    asText(v.get('feeAdd' + idx + '.calculationType')),
                    asText(v.get('feeAdd' + idx + '.percentage')),
                    asText(v.get('feeAdd' + idx + '.amount'))
                });
            }
            when 'collateral_create_', 'collateral_own_', 'pledge_add_', 'pledge_verify_' {
                target(out, v, 'pledgeAdd' + idx);
                out.after = join(new List<String>{
                    asText(v.get('pledgeAdd' + idx + '.assetLabel')),
                    asText(v.get('pledgeAdd' + idx + '.collateralTypeName')),
                    asText(v.get('pledgeAdd' + idx + '.amountPledged'))
                });
            }
            when 'policy_exception_add_', 'policy_exception_verify_' {
                target(out, v, 'policyException' + idx);
                out.after = join(new List<String>{
                    asText(v.get('policyException' + idx + '.title')),
                    asText(v.get('policyException' + idx + '.status'))
                });
            }
            when 'new_facility_', 'new_facility_involve_', 'new_facility_verify_', 'new_facility_purpose_' {
                out.targetLabel = asText(v.get('newFacility' + idx + '.label'));
                out.after = join(new List<String>{
                    asText(v.get('newFacility' + idx + '.product')),
                    asText(v.get('newFacility' + idx + '.amount')),
                    asText(v.get('newFacility' + idx + '.termMonths'))
                });
            }
            when else {
                // A family this read does not know keeps its label and claims no value. Guessing
                // one would be worse than silence: see the class note on flat plans.
            }
        }
    }

    /**
     * The target of an arm, which is either a booked facility by id or a net-new one by label.
     *
     * A net-new facility has no id until execute time, so every other arm of the same plan may name
     * it by the label the plan gave it. Both are reported, and exactly one is ever set.
     *
     * @param out The wire step being built.
     * @param v The plan's resolved values.
     * @param prefix The arm's value prefix, for example covenantAdd0.
     */
    private static void target(ActionStep out, Map<String, Object> v, String prefix) {
        out.targetLoanId = asText(v.get(prefix + '.targetLoanId'));
        out.targetLabel = asText(v.get(prefix + '.targetNewLabel'));
    }

    /**
     * The scalars landing on one facility's clone: the per-target ones aimed at it, or the flat
     * ones the request broadcast to every selected facility.
     *
     * One scalar names its field; more than one cannot, so the joined rendering carries them and
     * `field` stays null rather than naming an arbitrary one of them.
     *
     * @param out The wire step being built, with its targetLoanId already set.
     * @param v The plan's resolved values.
     */
    private static void applyScalars(ActionStep out, Map<String, Object> v) {
        List<String> fields = new List<String>();
        List<String> figures = new List<String>();

        Integer staged = intOf(v.get('scalarChangeCount'));
        for (Integer i = 0; i < staged; i++) {
            if (asText(v.get('scalarChange' + i + '.targetLoanId')) != out.targetLoanId) {
                continue;
            }
            String fieldName = SCALAR_FIELDS.get(asText(v.get('scalarChange' + i + '.key')));
            if (fieldName == null) {
                continue;
            }
            fields.add(fieldName);
            figures.add(asText(v.get('scalarChange' + i + '.value')));
        }

        if (staged == 0) {
            for (String key : SCALAR_FIELDS.keySet()) {
                if (v.get(key) == null) {
                    continue;
                }
                fields.add(SCALAR_FIELDS.get(key));
                figures.add(asText(v.get(key)));
            }
        }

        if (fields.isEmpty()) {
            return;
        }
        if (fields.size() == 1) {
            out.field = fields[0];
            out.after = figures[0];
            return;
        }
        List<String> both = new List<String>();
        for (Integer i = 0; i < fields.size(); i++) {
            both.add(fields[i] + ' ' + figures[i]);
        }
        out.after = String.join(both, '; ');
    }

    /* ------------------------------------------------------------------- change counts */

    /**
     * Splits a plan's changes into what was asked for and what the plan added to make it legal.
     *
     * nCino refuses a payment schedule without an amortised term and a first payment date, so a
     * plan that moves a commitment or a term carries those two whether or not anybody named them.
     * They are real writes and a memo must show them; counting them as requested would credit the
     * banker with a decision the schedule made.
     *
     * Returns null rather than zeroes when the plan carries none of these keys at all, because
     * "this action has no change counts" and "this action changed nothing" are different facts.
     *
     * @param v The plan's resolved values.
     * @return The split, or null when the plan's shape does not carry one.
     */
    private static ChangeCounts countChanges(Map<String, Object> v) {
        if (v == null || v.isEmpty()) {
            return null;
        }
        List<String> countKeys = new List<String>{
            'scalarChangeCount', 'fieldChangeCount', 'covenantAddCount', 'covenantAttachCount',
            'involvementChangeCount', 'covenantExclusionCount', 'pledgeExclusionCount',
            'feeAddCount', 'pledgeAddCount', 'policyExceptionAddCount', 'newFacilityCount'
        };

        Boolean derivable = false;
        Integer total = 0;
        for (String k : countKeys) {
            if (v.containsKey(k)) {
                derivable = true;
                total += intOf(v.get(k));
            }
        }

        Integer staged = intOf(v.get('scalarChangeCount'));
        for (String k : SCALAR_FIELDS.keySet()) {
            if (!v.containsKey(k)) {
                continue;
            }
            derivable = true;
            // The flat scalars broadcast, and are only in play when nothing was aimed per target.
            if (staged == 0 && v.get(k) != null) {
                total++;
            }
        }
        if (!derivable) {
            return null;
        }

        Boolean movesAmountOrTerm = v.get('requestedAmount') != null || v.get('requestedTermMonths') != null;
        for (Integer i = 0; i < staged; i++) {
            String key = asText(v.get('scalarChange' + i + '.key'));
            if (key == 'requestedAmount' || key == 'requestedTermMonths') {
                movesAmountOrTerm = true;
            }
        }

        Integer derived = 0;
        if (movesAmountOrTerm) {
            Integer fieldChanges = intOf(v.get('fieldChangeCount'));
            for (Integer i = 0; i < fieldChanges; i++) {
                if (PRICING_PREREQUISITES.contains(asText(v.get('fieldChange' + i + '.field')))) {
                    derived++;
                }
            }
        }

        ChangeCounts out = new ChangeCounts();
        out.derived = derived;
        out.requested = total - derived;
        return out;
    }

    /* ------------------------------------------------------------------ package versions */

    /**
     * Every version of one package, walked through the loan renewal chain.
     *
     * A package carries no lookup to the version it came from - checked against the org's own
     * describe - so the chain between a parent facility and its clone is the only link there is.
     * The walk is a fixed point: it stops as soon as a hop adds no package, and at
     * PACKAGE_VERSION_HOPS regardless, because a query budget is not a place to trust a graph.
     *
     * @param seed The package id the caller sent, at either end of the chain.
     * @return The seed plus every package reachable from it.
     */
    private static Set<Id> packageVersions(Id seed) {
        Set<Id> packages = new Set<Id>{ seed };

        for (Integer hop = 0; hop < PACKAGE_VERSION_HOPS; hop++) {
            Set<Id> members = new Set<Id>();
            for (LLC_BI__Loan__c l : [
                SELECT Id FROM LLC_BI__Loan__c
                WHERE LLC_BI__Product_Package__c IN :packages
                WITH USER_MODE
                LIMIT 2000
            ]) {
                members.add(l.Id);
            }
            if (members.isEmpty()) {
                return packages;
            }

            Set<Id> related = new Set<Id>();
            for (LLC_BI__LoanRenewal__c j : [
                SELECT LLC_BI__ParentLoanId__c, LLC_BI__RenewalLoanId__c
                FROM LLC_BI__LoanRenewal__c
                WHERE LLC_BI__ParentLoanId__c IN :members OR LLC_BI__RenewalLoanId__c IN :members
                WITH USER_MODE
                LIMIT 2000
            ]) {
                if (j.LLC_BI__ParentLoanId__c != null && !members.contains(j.LLC_BI__ParentLoanId__c)) {
                    related.add(j.LLC_BI__ParentLoanId__c);
                }
                if (j.LLC_BI__RenewalLoanId__c != null && !members.contains(j.LLC_BI__RenewalLoanId__c)) {
                    related.add(j.LLC_BI__RenewalLoanId__c);
                }
            }
            if (related.isEmpty()) {
                return packages;
            }

            Integer before = packages.size();
            for (LLC_BI__Loan__c l : [
                SELECT LLC_BI__Product_Package__c FROM LLC_BI__Loan__c
                WHERE Id IN :related AND LLC_BI__Product_Package__c != null
                WITH USER_MODE
            ]) {
                packages.add(l.LLC_BI__Product_Package__c);
            }
            if (packages.size() == before) {
                return packages;
            }
        }

        return packages;
    }

    /* ------------------------------------------------------------------------ labelling */

    /**
     * Names the target facilities, one query for every step that points at one.
     *
     * A facility whose name does not come back keeps its id and no label, which is the honest
     * answer for a record the running banker cannot see.
     *
     * @param steps The wire steps carrying a targetLoanId and no label yet.
     */
    private static void labelFacilities(List<ActionStep> steps) {
        if (steps.isEmpty()) {
            return;
        }
        Map<String, List<ActionStep>> waiting = new Map<String, List<ActionStep>>();
        Set<Id> ids = new Set<Id>();
        for (ActionStep s : steps) {
            try {
                ids.add(Id.valueOf(s.targetLoanId));
            } catch (System.StringException e) {
                // A plan value that is not a well-formed id keeps its raw text and no label.
                continue;
            }
            if (!waiting.containsKey(s.targetLoanId)) {
                waiting.put(s.targetLoanId, new List<ActionStep>());
            }
            waiting.get(s.targetLoanId).add(s);
        }
        if (ids.isEmpty()) {
            return;
        }

        for (LLC_BI__Loan__c loan : [SELECT Id, Name FROM LLC_BI__Loan__c WHERE Id IN :ids WITH USER_MODE]) {
            // A plan may hold the 15-character form, which the query still matches but the map does
            // not, so both spellings are tried before the step is left unlabelled.
            List<ActionStep> pending = waiting.get(String.valueOf(loan.Id));
            if (pending == null) {
                pending = waiting.get(String.valueOf(loan.Id).substring(0, 15));
            }
            if (pending == null) {
                continue;
            }
            for (ActionStep s : pending) {
                s.targetLabel = loan.Name;
            }
        }
    }

    /**
     * Resolves the org-assigned names of the created records, one query per object type rather
     * than one per row.
     *
     * Key prefixes are read from the describe rather than hardcoded, so the mapping cannot drift
     * from the org. A record whose prefix is not one of the three shipping write targets resolves
     * to no name and the caller still gets its id, which is the honest answer for a record type
     * this tool does not know how to label.
     *
     * @param rows The staging rows being returned.
     * @return Record id to org-assigned name, for the ids this tool could resolve.
     */
    private static Map<String, String> resolveNames(List<cm_Action_Staging__c> rows) {
        Map<String, String> namesById = new Map<String, String>();

        Set<String> ids = new Set<String>();
        for (cm_Action_Staging__c r : rows) {
            if (String.isNotBlank(r.cm_Result_Record_Id__c)) {
                ids.add(r.cm_Result_Record_Id__c);
            }
        }
        if (ids.isEmpty()) {
            return namesById;
        }

        // Case carries no Name field; its label is CaseNumber. The other two are autonumber Names.
        Map<String, String> nameFieldByObject = new Map<String, String>{
            'LLC_BI__Collateral_Valuation__c' => 'Name',
            'Case' => 'CaseNumber',
            'LLC_BI__Review__c' => 'Name'
        };

        for (String objectApiName : nameFieldByObject.keySet()) {
            Schema.SObjectType t = Schema.getGlobalDescribe().get(objectApiName);
            if (t == null) {
                continue;
            }
            String prefix = t.getDescribe().getKeyPrefix();
            if (String.isBlank(prefix)) {
                continue;
            }

            Set<Id> forThisObject = new Set<Id>();
            for (String rid : ids) {
                if (rid.length() >= 3 && rid.substring(0, 3) == prefix) {
                    try {
                        forThisObject.add(Id.valueOf(rid));
                    } catch (System.StringException e) {
                        // A stored value that is not a well-formed id resolves to no name rather
                        // than failing the whole read.
                        continue;
                    }
                }
            }
            if (forThisObject.isEmpty()) {
                continue;
            }

            String nameField = nameFieldByObject.get(objectApiName);
            String soql = 'SELECT Id, ' + nameField + ' FROM ' + objectApiName + ' WHERE Id IN :forThisObject WITH USER_MODE';
            for (SObject s : Database.query(soql)) {
                namesById.put(String.valueOf(s.get('Id')), String.valueOf(s.get(nameField)));
            }
        }

        return namesById;
    }

    /* --------------------------------------------------------------------------- small parts */

    /** The trailing digits of a step id, or null where it carries none. */
    private static String trailingIndex(String stepId) {
        Integer size = stepId.length();
        Integer i = size;
        while (i > 0 && stepId.substring(i - 1, i).isNumeric()) {
            i--;
        }
        return i == size ? null : stepId.substring(i, size);
    }

    /** A resolved value as text. Null stays null: String.valueOf would make it the word "null". */
    private static String asText(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    /** A resolved count as an Integer. A JSON round trip returns a number as any of these three. */
    private static Integer intOf(Object v) {
        if (v instanceof Integer) {
            return (Integer) v;
        }
        if (v instanceof Decimal) {
            return ((Decimal) v).intValue();
        }
        if (v instanceof Double) {
            return ((Double) v).intValue();
        }
        return 0;
    }

    /** The non-null parts of a description, spaced. Empty becomes null rather than a blank string. */
    private static String join(List<String> parts) {
        List<String> kept = new List<String>();
        for (String p : parts) {
            if (String.isNotBlank(p)) {
                kept.add(p);
            }
        }
        return kept.isEmpty() ? null : String.join(kept, ' ');
    }

    /**
     * A field-wave value, which the plan stores JSON-encoded so the hash covers its type.
     *
     * @param valueJson The encoded value, or null.
     * @return The value as text, or the raw string when it does not parse.
     */
    private static String decodeJson(String valueJson) {
        if (String.isBlank(valueJson)) {
            return null;
        }
        try {
            return asText(JSON.deserializeUntyped(valueJson));
        } catch (System.JSONException e) {
            return valueJson;
        }
    }

    /** What one step costs against the response's step budget. */
    private static Integer weigh(ActionStep s) {
        Integer n = 0;
        for (String part : new List<String>{ s.id, s.type, s.label, s.objectName, s.targetLabel,
                                             s.field, s.before, s.after, s.verification, s.state }) {
            n += part == null ? 0 : part.length();
        }
        return n;
    }

    /**
     * The response note: what was read, what was not, and why an empty list may not mean nothing.
     *
     * @param entries The rows being returned.
     * @param packageFilter The package versions the trail was narrowed to, or null.
     * @param includeSteps Whether the caller asked for steps on old rows.
     * @param rowsWithoutSteps Executed rows that qualified for steps and did not get them.
     * @return The note.
     */
    private static String note(
        List<ActionHistoryEntry> entries,
        Set<Id> packageFilter,
        Boolean includeSteps,
        Integer rowsWithoutSteps
    ) {
        if (entries.isEmpty()) {
            return packageFilter == null
                ? 'No action history visible for this relationship. This object is Private and this tool runs as you, so ' +
                  'actions taken by a colleague are not shown. Supervisory review needs a sharing rule or View All on the ' +
                  'staging object.'
                : 'No action history visible for this relationship on that package or any version of it. This object is ' +
                  'Private and this tool runs as you, so actions taken by a colleague are not shown.';
        }

        List<String> parts = new List<String>{
            'Newest first. Plan hashes are reported as present or absent, never returned. Decision-token material is ' +
            'never read by this tool.'
        };
        if (packageFilter != null) {
            parts.add('Narrowed to ' + packageFilter.size() + ' version' + (packageFilter.size() == 1 ? '' : 's') +
                ' of the named package, walked through the loan renewal chain.');
        }
        parts.add(includeSteps
            ? 'Steps are returned for every executed row, however old.'
            : 'Steps are returned for executed rows from the last ' + RECENT_DAYS +
              ' days. Ask with includeSteps to get them on older rows.');
        if (rowsWithoutSteps > 0) {
            parts.add(rowsWithoutSteps + ' executed row' + (rowsWithoutSteps == 1 ? '' : 's') +
                ' came back without steps because this read had already spent its step budget: at most ' + MAX_STEP_ROWS +
                ' rows and ' + STEPS_CHAR_BUDGET + ' characters of steps per response. Ask for fewer rows, or narrow to ' +
                'one package, to read them.');
        }
        return String.join(parts, ' ');
    }
}
