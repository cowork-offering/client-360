/**
 * C360Plan - the immutable execution plan that stage_* returns and execute_* replays.
 *
 * A33.0.1: stage_* performs ZERO domain-object DML. It validates, computes, and returns
 * this plan. A33.3.2: every write is a step, not every step is a write. The tracker the
 * banker reads at the confirm gate is this steps[] array, which is why the plan hash has
 * to be stable across serialisation.
 *
 * Not an invocable class. Each tool maps these plain structures into its own @InvocableVariable
 * inner classes, matching the Customer360* read-tool pattern where every wire-visible type is
 * an inner class of the invocable class itself.
 */
public with sharing class C360Plan {

    /** A33.3.2 step types. `wait` arrived with new-facility, the action that needs it. */
    public static final String TYPE_WRITE = 'write';
    public static final String TYPE_VERIFICATION = 'verification';
    public static final String TYPE_WAIT = 'wait';
    public static final String TYPE_HANDOFF = 'handoff';
    public static final String TYPE_OBSERVED = 'observed_side_effect';

    /**
     * A33.3.3 step states. `waiting` arrived with new-facility's asynchronous Loan Detail hold.
     * `running` and `ambiguous` still have no producer: nothing here retries a transport fault.
     */
    public static final String STATE_PENDING = 'pending';
    public static final String STATE_WAITING = 'waiting';
    public static final String STATE_FILED_UNVERIFIED = 'filed_unverified';
    public static final String STATE_VERIFIED = 'verified';
    public static final String STATE_FAILED = 'failed';
    public static final String STATE_SKIPPED = 'skipped_not_attempted';

    /** A33.3.3 action-level terminal states. */
    public static final String TERMINAL_SUCCESS = 'success';
    public static final String TERMINAL_PARTIAL = 'partial';
    public static final String TERMINAL_FAILED = 'failed';

    /**
     * One entry in the plan. `objectName` and `fields` are populated on write steps only,
     * `verification` carries the query that proves the write landed, and `waitBudgetMs` is
     * declared on wait steps so budget exhaustion lands in filed_unverified rather than a false
     * green (A33.3.3).
     */
    public class Step {
        public String id;
        public String type;
        public String label;
        public String objectName;
        public List<String> fields;
        public List<String> automationWoken;
        public String verification;
        public Integer waitBudgetMs;
        public String state;
        public String detail;

        public Step(String id, String type, String label) {
            this.id = id;
            this.type = type;
            this.label = label;
            this.fields = new List<String>();
            this.automationWoken = new List<String>();
            this.state = STATE_PENDING;
        }

        /** Declares the object and field set a write step touches. */
        public Step onObject(String objectName, List<String> fields) {
            this.objectName = objectName;
            this.fields = fields;
            return this;
        }

        /** Declares the org automation this step is expected to wake (A33.3.2). */
        public Step wakes(List<String> automation) {
            this.automationWoken = automation;
            return this;
        }

        /** Declares the query that proves the step landed. */
        public Step provenBy(String verificationQuery) {
            this.verification = verificationQuery;
            return this;
        }

        /**
         * Declares a bounded wait. Probe 5 timed the Loan Detail flow at about 4 seconds and
         * proved it produces NO AsyncApexJob row, so a poller must watch the target record and a
         * 10 to 30 second budget is evidence-backed.
         */
        public Step waitingUpTo(Integer budgetMs) {
            this.waitBudgetMs = budgetMs;
            return this;
        }
    }

    /**
     * Canonical plan hash. Ordered steps plus the resolved field values, so a plan that
     * executes against different values than the banker confirmed produces a different hash
     * and execute_* refuses it (A33.5.3).
     *
     * Apex Map iteration order is not guaranteed, so resolved values are sorted by key before
     * hashing. Without that, the same plan hashes differently between transactions.
     *
     * @param actionId Registry action id.
     * @param steps The ordered plan steps.
     * @param resolvedValues The field values the plan will write, keyed by field API name.
     * @return Lowercase hex SHA-256 digest.
     */
    public static String hash(String actionId, List<Step> steps, Map<String, Object> resolvedValues) {
        List<String> parts = new List<String>{ actionId };

        for (Step s : steps) {
            List<String> fieldNames = s.fields == null ? new List<String>() : s.fields.clone();
            fieldNames.sort();
            parts.add(s.id + '~' + s.type + '~' + String.valueOf(s.objectName) + '~' + String.join(fieldNames, ','));
        }

        List<String> keys = new List<String>(resolvedValues.keySet());
        keys.sort();
        for (String k : keys) {
            parts.add(k + '=' + String.valueOf(resolvedValues.get(k)));
        }

        Blob digest = Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(parts, '\n')));
        return EncodingUtil.convertToHex(digest);
    }

    /**
     * Derives the action-level terminal state from the step states (A33.3.3).
     *
     * A deliberate handoff counts as settled: control passing to nCino's own process is the
     * designed end of our involvement, not an incomplete run.
     *
     * observed_side_effect steps are excluded from the accounting. A33.3.2 says they are never
     * claimed as verified unless a verification step proves it, so letting one gate the terminal
     * state would make every action carrying one permanently partial. They are surfaced to the
     * banker and they decide nothing.
     *
     * @param steps The plan steps carrying their final states.
     * @return One of success, partial, failed.
     */
    public static String terminalState(List<Step> steps) {
        Boolean anySettled = false;
        Boolean anyUnsettled = false;

        for (Step s : steps) {
            if (s.type == TYPE_OBSERVED) {
                continue;
            }
            if (s.state == STATE_VERIFIED) {
                anySettled = true;
            } else {
                anyUnsettled = true;
            }
        }

        if (!anySettled) {
            return TERMINAL_FAILED;
        }
        return anyUnsettled ? TERMINAL_PARTIAL : TERMINAL_SUCCESS;
    }

    /**
     * Serialises the staged output for persistence on the staging record.
     *
     * The resolved values ride with the plan on purpose. execute_* takes "none beyond the plan"
     * (A33.5.7), so the values it writes are the values the banker saw hashed at the confirm
     * gate, not a fresh payload that could differ.
     *
     * @param summary Banker-language description of what will be written.
     * @param steps The ordered plan steps.
     * @param warnings Side effects the banker must see before confirming.
     * @param provenance Per-field prefill provenance and narrative attribution.
     * @param resolvedValues The field values the plan will write, keyed by field API name.
     * @return JSON string.
     */
    public static String serializePlan(
        String summary,
        List<Step> steps,
        List<String> warnings,
        Map<String, Object> provenance,
        Map<String, Object> resolvedValues
    ) {
        Map<String, Object> doc = new Map<String, Object>{
            'summary' => summary,
            'steps' => steps,
            'warnings' => warnings,
            'provenance' => provenance,
            'values' => resolvedValues
        };
        return JSON.serialize(doc);
    }

    /**
     * Reads the steps back off a persisted plan so execute_* replays exactly what was staged.
     *
     * @param planJson The JSON written by serializePlan.
     * @return The ordered steps.
     */
    public static List<Step> deserializeSteps(String planJson) {
        Map<String, Object> doc = (Map<String, Object>) JSON.deserializeUntyped(planJson);
        return (List<Step>) JSON.deserialize(JSON.serialize(doc.get('steps')), List<Step>.class);
    }

    /**
     * Reads the resolved field values back off a persisted plan.
     *
     * @param planJson The JSON written by serializePlan.
     * @return The field values, keyed by field API name.
     */
    public static Map<String, Object> deserializeValues(String planJson) {
        Map<String, Object> doc = (Map<String, Object>) JSON.deserializeUntyped(planJson);
        return (Map<String, Object>) doc.get('values');
    }

    /**
     * Sets the outcome on one step of a plan being executed.
     *
     * @param steps The plan steps.
     * @param stepId The step to mark.
     * @param state One of the STATE_ constants.
     * @param detail Banker-readable explanation of what happened.
     */
    public static void setState(List<Step> steps, String stepId, String state, String detail) {
        for (Step s : steps) {
            if (s.id == stepId) {
                s.state = state;
                s.detail = detail;
                return;
            }
        }
    }

    /**
     * Marks the first step failed and everything after it as not attempted (A33.3.3: a step whose
     * precondition did not hold stays unattempted rather than being reported as a failure of its
     * own).
     *
     * @param steps The plan steps.
     * @param detail Why the plan stopped before it started.
     */
    public static void markRefused(List<Step> steps, String detail) {
        for (Integer i = 0; i < steps.size(); i++) {
            steps[i].state = i == 0 ? STATE_FAILED : STATE_SKIPPED;
            if (i == 0) {
                steps[i].detail = detail;
            }
        }
    }

    /** JSON round-trip loses Apex types. These five restore them at the write boundary. */
    public static Id asId(Object v) {
        return v == null || String.isBlank(String.valueOf(v)) ? null : Id.valueOf(String.valueOf(v));
    }

    public static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    public static Decimal asDecimal(Object v) {
        return v == null ? null : Decimal.valueOf(String.valueOf(v));
    }

    public static Date asDate(Object v) {
        return v == null || String.isBlank(String.valueOf(v)) ? null : Date.valueOf(String.valueOf(v).substring(0, 10));
    }

    public static Boolean asBool(Object v) {
        return v == true;
    }
}
