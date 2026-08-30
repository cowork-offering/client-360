/**
 * C360ActionStaging - the staging store, the decision token, and the idempotency fence.
 *
 * A33.0.1 permits stage_* to write exactly two things: the staging record and the decision
 * ledger entry. Neither is a domain object in the bank's credit model, which is what keeps the
 * zero-DML boundary intact while still giving execute_* something durable to bind to.
 *
 * A33.3.3 makes this record the AUTHORITY on tracker state. The client's sessionStorage copy is
 * a cache, so a full artifact replace can neither lose nor fabricate progress.
 *
 * DECISION TOKEN MINT (implementation note, A33.5.4). A33.5.4 states the properties the token
 * must hold - single use, bound to stagingId + planHash + banker user id, not mintable by the
 * model - but does not name the surface that mints it. This implementation mints server-side on
 * the stage_* response and stores only the SHA-256 digest. Two consequences worth stating
 * plainly rather than burying:
 *   1. The raw token is never persisted, so a staging record read cannot yield a usable token.
 *   2. The token IS visible in the stage_* response, so a model that called stage_* can see it.
 *      The residual control is that execute_* requires approverUserId to equal the running
 *      identity, and the Customer 360 server runs as-user, so a replay still executes as the
 *      named banker against the exact planHash the banker saw. Closing the gap fully needs a
 *      panel-side mint endpoint that A33 does not currently specify.
 */
public with sharing class C360ActionStaging {

    /** Raised when staging, token or idempotency preconditions are not met. */
    public class StagingException extends Exception {}

    /** The outcome of a stage_* call: the handle, the hash, and the freshly minted token. */
    public class Staged {
        public Id stagingId;
        public String planHash;
        public String decisionToken;
        public Boolean replayed;
    }

    /**
     * Persists a plan and mints its decision token, or returns the existing staging record when
     * the idempotency key has been seen before.
     *
     * A replayed stage never re-mints: re-minting would hand out a second single-use token for
     * a plan the banker already confirmed, which is precisely the property A33.5.4 forbids. A
     * replay returns the same plan hash with a null token, and the caller resumes with the token
     * it already holds.
     *
     * @param actionId Registry action id (A27.2).
     * @param idempotencyKey Client-generated, stable across resume (A33.5.2).
     * @param accountId The borrower relationship.
     * @param productPackageId The deal anchor and deep-link target, may be null.
     * @param planJson The serialised plan from C360Plan.serializePlan.
     * @param planHash The canonical plan hash from C360Plan.hash.
     * @return The staging handle. `replayed` is true when an existing record was returned.
     */
    public static Staged stagePlan(
        String actionId,
        String idempotencyKey,
        Id accountId,
        Id productPackageId,
        String planJson,
        String planHash
    ) {
        if (String.isBlank(idempotencyKey)) {
            throw new StagingException('idempotencyKey is required on every tool call (A33.5.2).');
        }

        List<cm_Action_Staging__c> existing = [
            SELECT Id, cm_Plan_Hash__c, cm_Status__c
            FROM cm_Action_Staging__c
            WHERE cm_Idempotency_Key__c = :idempotencyKey
            WITH USER_MODE
            LIMIT 1
        ];

        Staged out = new Staged();
        if (!existing.isEmpty()) {
            out.stagingId = existing[0].Id;
            out.planHash = existing[0].cm_Plan_Hash__c;
            out.decisionToken = null;
            out.replayed = true;
            return out;
        }

        String token = EncodingUtil.convertToHex(Crypto.generateAesKey(256));

        cm_Action_Staging__c rec = new cm_Action_Staging__c(
            cm_Action_Id__c = actionId,
            cm_Idempotency_Key__c = idempotencyKey,
            cm_Plan_Hash__c = planHash,
            cm_Plan_JSON__c = planJson,
            cm_Status__c = 'Staged',
            cm_Decision_Token_Hash__c = tokenDigest(token, planHash, UserInfo.getUserId()),
            cm_Actor_User__c = UserInfo.getUserId(),
            cm_Account__c = accountId,
            cm_Product_Package__c = productPackageId
        );
        insert as user rec;

        out.stagingId = rec.Id;
        out.planHash = planHash;
        out.decisionToken = token;
        out.replayed = false;
        return out;
    }

    /**
     * Validates every execute_* precondition and consumes the token in the same transaction.
     *
     * Refuses, as four distinct failures (BUILD-BRIEF-V2 WP2 criterion 3): a missing token, a
     * token already consumed, a token whose digest does not match this stagingId + planHash +
     * approver, and a planHash that no longer matches the staged plan.
     *
     * @param stagingId The handle returned by stage_*.
     * @param planHash The hash the banker confirmed.
     * @param decisionToken The single-use token minted at stage time.
     * @param approverUserId The named human bound to the token. Must be the running identity.
     * @return The claimed staging record, with the token marked consumed.
     * @throws StagingException on any precondition failure.
     */
    public static cm_Action_Staging__c claimForExecute(
        Id stagingId,
        String planHash,
        String decisionToken,
        Id approverUserId
    ) {
        cm_Action_Staging__c rec = assertClaimable(stagingId, planHash, decisionToken, approverUserId);
        rec.cm_Token_Consumed_At__c = System.now();
        rec.cm_Approver_User__c = approverUserId;
        rec.cm_Status__c = 'Executing';
        update as user rec;
        return rec;
    }

    /**
     * The same preconditions as claimForExecute, WITHOUT consuming the token or writing anything.
     *
     * A caller that cannot host the execution itself (the MCP dispatcher context, which relays into
     * a REST transaction) has to refuse a bad token before it goes anywhere, and must leave a good
     * one unburned: a relay that never arrives has to be retryable, and Apex forbids DML before a
     * callout regardless. The leg that actually executes calls claimForExecute and burns it there.
     *
     * @param stagingId The handle returned by stage_*.
     * @param planHash The hash the banker confirmed.
     * @param decisionToken The single-use token minted at stage time.
     * @param approverUserId The named human bound to the token. Must be the running identity.
     * @return The staging record, untouched.
     * @throws StagingException on any precondition failure.
     */
    public static cm_Action_Staging__c assertClaimable(
        Id stagingId,
        String planHash,
        String decisionToken,
        Id approverUserId
    ) {
        if (String.isBlank(decisionToken)) {
            throw new StagingException('decisionToken is required. No execute_* runs without one (A33.5.4).');
        }
        if (approverUserId == null) {
            throw new StagingException('approverUserId is required on every execute_* without exception (A33.5.2).');
        }
        if (approverUserId != UserInfo.getUserId()) {
            throw new StagingException(
                'approverUserId does not match the running identity. The token binds a named human to a plan, ' +
                'and this server runs as-user (A33.5.4).'
            );
        }

        List<cm_Action_Staging__c> rows = [
            SELECT Id, cm_Action_Id__c, cm_Plan_Hash__c, cm_Plan_JSON__c, cm_Status__c,
                   cm_Decision_Token_Hash__c, cm_Token_Consumed_At__c, cm_Result_Record_Id__c,
                   cm_Tracker_JSON__c, cm_Idempotency_Key__c, cm_Account__c, cm_Product_Package__c
            FROM cm_Action_Staging__c
            WHERE Id = :stagingId
            WITH USER_MODE
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            throw new StagingException('No staging record found for stagingId ' + stagingId + '.');
        }
        cm_Action_Staging__c rec = rows[0];

        if (rec.cm_Plan_Hash__c != planHash) {
            throw new StagingException(
                'planHash does not match the staged plan. A plan is never executed against figures the banker ' +
                'did not see (A33.2.7). Re-stage the action.'
            );
        }
        if (rec.cm_Token_Consumed_At__c != null) {
            throw new StagingException('This decision token has already been used. Tokens are single use (A33.5.4).');
        }
        if (rec.cm_Decision_Token_Hash__c != tokenDigest(decisionToken, planHash, approverUserId)) {
            throw new StagingException('decisionToken is not valid for this stagingId, planHash and approver (A33.5.4).');
        }
        return rec;
    }

    /**
     * Returns the completed staging record when this idempotency key has already produced a
     * domain record, so a replay reports the prior result instead of writing a second one.
     *
     * The platform is known to produce duplicates on failed background Apex (A33.3.5), so
     * idempotency is ours to enforce and cannot be assumed.
     *
     * @param idempotencyKey The client-generated key.
     * @return The completed record, or null when no completed run exists.
     */
    public static cm_Action_Staging__c findCompleted(String idempotencyKey) {
        List<cm_Action_Staging__c> rows = [
            SELECT Id, cm_Action_Id__c, cm_Plan_Hash__c, cm_Result_Record_Id__c, cm_Tracker_JSON__c, cm_Status__c
            FROM cm_Action_Staging__c
            WHERE cm_Idempotency_Key__c = :idempotencyKey
              AND cm_Result_Record_Id__c != null
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    /**
     * Writes the final tracker state back to the authority record.
     *
     * @param rec The claimed staging record.
     * @param steps The plan steps carrying their final states.
     * @param terminalState One of C360Plan.TERMINAL_SUCCESS, TERMINAL_PARTIAL, TERMINAL_FAILED.
     * @param resultRecordId The domain record id created, or null when nothing was written.
     */
    public static void recordOutcome(
        cm_Action_Staging__c rec,
        List<C360Plan.Step> steps,
        String terminalState,
        String resultRecordId
    ) {
        rec.cm_Tracker_JSON__c = JSON.serialize(steps);
        rec.cm_Result_Record_Id__c = resultRecordId;
        rec.cm_Executed_At__c = System.now();
        rec.cm_Status__c = terminalState == C360Plan.TERMINAL_SUCCESS
            ? 'Completed'
            : (terminalState == C360Plan.TERMINAL_PARTIAL ? 'Partial' : 'Failed');
        update as user rec;
    }

    /**
     * Binds the token to the plan and the human in one digest. The raw token never lands in
     * the database, so a read of the staging record cannot yield a usable token.
     */
    private static String tokenDigest(String token, String planHash, Id userId) {
        Blob digest = Crypto.generateDigest('SHA-256', Blob.valueOf(token + '|' + planHash + '|' + String.valueOf(userId)));
        return EncodingUtil.convertToHex(digest);
    }
}
