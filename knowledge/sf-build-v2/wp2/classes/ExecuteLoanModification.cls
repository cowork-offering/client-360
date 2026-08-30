/**
 * ExecuteLoanModification - MCP tool: execute_loan_modification.
 *
 * Runs the plan stage_loan_modification staged, behind the single-use decision token. The token is
 * evidence that a named human saw a specific plan and pressed confirm (A33.5.4). It is not a credit
 * approval: this tool produces a modification CLONE at Qualification and stops. Booking that clone
 * still requires nCino's own Submit for Approval, because Loan_Validation_06 carries no bypass.
 *
 * WHY THIS SHIPS NOW, AFTER A WAVE OF BEING HELD. The hold was never about the credit action itself,
 * it was about reaching a Booked parent. That question was settled empirically (DEMO-RELATIONSHIP
 * section 1): LV06 keys on PRIORVALUE, which is blank on an INSERT, so a facility can be filed at
 * Booked directly as long as LV05's lookupKey is supplied. The mod-execute probe of 2026-08-20 then
 * ran the credit action live on throwaway data and observed the whole mechanism end to end:
 * clone at Stage Qualification with Is_Modification true and the lookupKey auto-suffixed _M1, parent
 * untouched with the hasRenewal formula flipped, and two LLC_BI__LoanRenewal__c rows (revision 0
 * self-referential anchor, revision 1 pointing at the clone). This class executes exactly that,
 * verifies it by re-query, and refuses to claim anything it could not read back.
 *
 * THE DOOR. nCino's supported programmatic entry point is the cross-package credit-action service
 * (ACTIONS-DESIGN 1.2), reached through the bean factory rather than by hand-rolling the clone.
 * Hand-rolling it would mean re-implementing the *_Relatives_to_Clone config, the junction row,
 * revision numbering and the Superseded cascade, all of which nCino already does and all of which
 * have documented failure modes. We call the bean IN-PROCESS from our own class rather than routing
 * through the org's acnpex_CreditActionRequest wrapper: same bean, same parameter names, but this
 * class owns its sharing declaration, its error surface and its verification, and does not depend on
 * a colleague's class staying the shape it is today. The wrapper's own outputLoanId derivation is
 * deliberately NOT copied - it takes the most recently created loan on the output package, which is
 * a guess that breaks the moment two facilities are modified in one call. We map clone to parent
 * through the junction chain instead, which is where nCino actually records lineage (ACTIONS-DESIGN
 * 1.4: the Loan self-lookups are null in this org).
 *
 * NEVER TRUST THE RETURN. PDI-00017266 records async credit-action failures that revert everything
 * silently, records landing in the Recycle Bin with no error, and kAHHu000000XaJVOA0 records failed
 * background Apex producing DUPLICATE modification loans carrying the same loan number. So: the
 * engine's success flag decides nothing on its own. Every clone is proven by re-query, every junction
 * row is proven by re-query, the parent is re-read and compared field by field, and idempotency is
 * enforced by us rather than assumed from nCino.
 *
 * WHAT THIS TOOL WILL NOT DO. It never touches the parent facility. It never moves the clone's Stage
 * (the clone arrives at Qualification and stays there; the one allowlisted Loan stage hop belongs to
 * execute_new_facility). It never deletes a chain row: kAHHu000000XasbOAC makes a junction row
 * deleted out from under its loan permanent poison.
 *
 * WHERE THIS RUNS, AND WHY THERE ARE TWO LEGS (2026-08-30). The Salesforce-hosted MCP dispatcher
 * invokes this class in a context that CANNOT host the engine: nCino's managed LoanTrigger reaches
 * for session APIs that context does not have, and dies in a way no catch block can see. The root
 * cause is documented rather than guessed: hosted MCP authenticates with a JWT access token, and
 * Apex's UserInfo.getSessionId() is specified as unusable under a JWT token (Apex Reference,
 * UserInfo). The same class, same org, same user, runs perfectly when invoked through the REST
 * Actions API. That context also proved it CAN make an HTTP callout (probe, 200). So a call that
 * arrives without inlineExecution does every read-only check it can, then calls out to a door that
 * re-enters the org over REST with inlineExecution true. The inner leg is the one that burns the
 * token, runs the engine, verifies and records the outcome, all inside a transaction that works.
 * The outer leg writes NOTHING: Apex forbids DML before a callout, and a hop that never arrives
 * has to leave the banker's single-use confirmation intact so a retry is still possible.
 *
 * TWO DOORS, IN ORDER, AND WHY. The first is the org calling ITSELF: a Visualforce page render
 * mints an opaque UI session id (Page.getContent, itself a callout since API 34), which is a token
 * the JWT restriction does not touch, and that session authenticates a POST straight back to this
 * org's own Actions API. Nothing leaves the platform, and there is no box to keep alive. It is
 * FIRST because it is the smaller system. It is not the ONLY door because whether a hosted-MCP
 * context can render that page at all is untested territory, and a write path may not rest on an
 * assumption. So when the session cannot be minted or the org refuses it, the call falls through to
 * an external relay that re-enters with a proper OAuth token. Which door carried a call is reported
 * on the result as relayPath, because "it worked" and "it worked the way we expected" are different
 * claims. Fallback is only ever taken on a failure that PROVABLY did not reach the action: a mint
 * that threw, a callout that threw, or an authentication refusal. Anything else is an answer.
 *
 * Org contract: A33.4.1. Write evidence: EVIDENCE-SEPT4.md "Mod-execute probe" and the WS0.5 probe
 * in the same file.
 */
// Recompile marker 2026-08-30: package-version pin must bind (LLC_BI 2.3789).
global with sharing class ExecuteLoanModification {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    /** Raised when nCino's own credit-action engine refuses. Reported as an org rejection, not ours. */
    public class EngineException extends Exception {}

    private static final String ACTION_ID = 'loan-modification';
    private static final String ACTION_TYPE = 'Modification';

    /**
     * The org's operator picklists, keyed by the symbol the plan carries. Two fields mirror each
     * other on every covenant in this org: Financial_Indicator_Operator__c spells the words (with
     * the org's own 'Greater Tan or Equal To' typo, which is the ACTIVE picklist value and must be
     * written as-is), Acnpex_Operator__c carries the symbol.
     */
    private static final Map<String, String> FI_OPERATOR = new Map<String, String>{
        '<' => 'Less Than',
        '<=' => 'Less Than or Equal To',
        '=' => 'Equals',
        '>=' => 'Greater Tan or Equal To',
        '>' => 'Greater Than'
    };
    private static final String BEAN_NAME = 'LLC_BI.InvokableCreditActionXPkg';
    private static final String RELAY_SECRET_HEADER = 'x-c360-relay-secret';
    private static final Integer RELAY_TIMEOUT_MS = 120000;
    private static final String ACTION_PATH = '/services/data/v61.0/actions/custom/apex/ExecuteLoanModification';
    private static final String PATH_SELF = 'self';
    private static final String PATH_BOX = 'box';

    private static final String RELAY_UNAVAILABLE =
        'The execution path into the org is unavailable, so nothing was attempted and nothing was written. ' +
        'The decision token has not been used: retry this same call once the path is back.';

    private static final String BOOKING_HANDOFF =
        'The modification exists as a facility at Qualification. Booking it requires nCino\'s Submit for Approval ' +
        'with real approvers: Loan_Validation_06 refuses a manual move to a post-approval stage and carries no ' +
        'permission bypass. Nothing here has been approved.';

    global class Request {
        @InvocableVariable(label='Idempotency Key' description='The same key the stage call used. Enforced by us: a replay reports the prior result and writes nothing.' required=true)
        global String idempotencyKey;
        @InvocableVariable(label='Staging Id' required=true)
        global String stagingId;
        @InvocableVariable(label='Plan Hash' description='Binds execution to the exact plan the banker confirmed. A mismatch is refused.' required=true)
        global String planHash;
        @InvocableVariable(label='Decision Token' description='Single use. Proves a named human confirmed this plan. Not a credit approval.' required=true)
        global String decisionToken;
        @InvocableVariable(label='Approver User Id' description='Required on every execute without exception. Must be the running identity.' required=true)
        global String approverUserId;
        @InvocableVariable(label='Inline Execution' description='INTERNAL PLUMBING. Leave unset. True means run nCino\'s credit action in THIS transaction, which only a REST transaction can do; the relay sets it on the inner leg, and that is also what stops a relay from relaying again.')
        global Boolean inlineExecution;
    }

    global class StepResult {
        @InvocableVariable(label='Step Id')
        global String id;
        @InvocableVariable(label='Type')
        global String type;
        @InvocableVariable(label='Label')
        global String label;
        @InvocableVariable(label='State' description='pending, verified, filed_unverified, failed or skipped_not_attempted.')
        global String state;
        @InvocableVariable(label='Detail')
        global String detail;
    }

    global class ToolError {
        @InvocableVariable(label='Code')
        global String code;
        @InvocableVariable(label='Message')
        global String message;
        @InvocableVariable(label='Org Error')
        global String orgError;
        @InvocableVariable(label='Step')
        global String step;
        @InvocableVariable(label='Resumable')
        global Boolean resumable;
        @InvocableVariable(label='Idempotency Key')
        global String idempotencyKey;
    }

    /** One selected facility and what the credit action actually did to it. */
    global class FacilityResult {
        @InvocableVariable(label='Facility Id' description='The parent facility. Never written by this tool.')
        global String facilityId;
        @InvocableVariable(label='Facility Name' description='The org-assigned parent name, read back rather than echoed.')
        global String facilityName;
        @InvocableVariable(label='Clone Loan Id' description='The modification facility nCino created from this parent.')
        global String cloneLoanId;
        @InvocableVariable(label='Clone Name' description='The name the ORG assigned the clone. A before-save flow rewrites loan names, so this is never a name anybody submitted.')
        global String cloneName;
        @InvocableVariable(label='Clone Lookup Key' description='nCino suffixes the parent core key, for example LP123_M1.')
        global String cloneLookupKey;
        @InvocableVariable(label='Clone Stage')
        global String cloneStage;
        @InvocableVariable(label='Junction Id' description='The LLC_BI__LoanRenewal__c row that records this lineage. The Loan self-lookups are null in this org.')
        global String junctionId;
        @InvocableVariable(label='Junction Name' description='For example RL-00000194.')
        global String junctionName;
        @InvocableVariable(label='Revision Number' description='Revision 0 is the self-referential anchor row. A real modification is revision 1 or higher.')
        global Decimal revisionNumber;
        @InvocableVariable(label='Verification' description='What was re-read from the org after the credit action, in plain terms.')
        global String verification;
        @InvocableVariable(label='Parent Unchanged' description='True when the parent re-reads at the same stage, status and amount it had before the action.')
        global Boolean parentUnchanged;
        @InvocableVariable(label='Applied Changes' description='The requested changes as they read back off the clone, or why they did not.')
        global String appliedChanges;
        @InvocableVariable(label='Outcome' description='Per-facility result in banker language.')
        global String outcome;
    }

    /** One net-new covenant this run created and attached to a clone. */
    global class CovenantResult {
        @InvocableVariable(label='Covenant Id')
        global String covenantId;
        @InvocableVariable(label='Covenant Name' description='The org-assigned auto-number, read back.')
        global String covenantName;
        @InvocableVariable(label='Type')
        global String typeName;
        @InvocableVariable(label='Threshold')
        global Decimal threshold;
        @InvocableVariable(label='Operator')
        global String operator;
        @InvocableVariable(label='Clone Loan Id' description='The modification clone the covenant was attached to.')
        global String cloneLoanId;
        @InvocableVariable(label='Verification')
        global String verification;
    }

    global class ExecuteResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Clone Loan Id' description='The modification facility created for the first selected facility.')
        global String cloneLoanId;
        @InvocableVariable(label='Record Name' description='The org-assigned name of the created record. Uniform across all execute_* tools so the activity trail can stamp a real label instead of a generic one.')
        global String recordName;
        @InvocableVariable(label='Anchor Name' description='The parent facility this modification hangs off.')
        global String anchorName;
        @InvocableVariable(label='Product Package Id' description='The deal anchor the credit action ran against.')
        global String productPackageId;
        @InvocableVariable(label='Output Package Id' description='The NEW package version nCino created. Package methodology: a modification versions the whole package, so this is never the source package.')
        global String outputPackageId;
        @InvocableVariable(label='New Package Name' description='The name of the new package version, after the org-convention repair when the engine left the account prefix blank.')
        global String newPackageName;
        @InvocableVariable(label='Members Rolled' description='How many package members the credit action rolled into the new version, the modified ones included.')
        global Integer membersRolled;
        @InvocableVariable(label='Covenants' description='One entry per net-new covenant this run created and attached to a clone.')
        global List<CovenantResult> covenants;
        @InvocableVariable(label='Terminal State' description='success, partial or failed.')
        global String terminalState;
        @InvocableVariable(label='Steps')
        global List<StepResult> steps;
        @InvocableVariable(label='Outcome' description='Banker-language result. Says plainly that nothing is approved.')
        global String outcome;
        @InvocableVariable(label='Booking Handoff' description='What still has to happen in nCino, by a human, for this modification to be booked.')
        global String bookingHandoff;
        @InvocableVariable(label='Facilities' description='One entry per selected facility, with its clone, its junction row and its verification.')
        global List<FacilityResult> facilities;
        @InvocableVariable(label='Facility Count')
        global Integer facilityCount;
        @InvocableVariable(label='Replayed' description='True when this idempotency key had already produced a record. Nothing was written.')
        global Boolean replayed;
        @InvocableVariable(label='Relay Path' description='Which door carried this execution into a transaction that could host the engine: self (the org calling itself with a Visualforce-minted session) or box (the external relay). Null when the call ran inline.')
        global String relayPath;
    }

    global class Response {
        @InvocableVariable(label='OK')
        global Boolean ok;
        @InvocableVariable(label='Result')
        global ExecuteResult result;
        @InvocableVariable(label='Error')
        global ToolError error;
    }

    /**
     * Executes a staged loan modification.
     *
     * @param requests One request per execution. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='execute_loan_modification'
        description='Execute a plan staged by stage_loan_modification, behind the single-use decision token. Invokes nCino\'s credit action as a PACKAGE VERSIONING move: all eligible members roll into a new package, the staged changes land on the selected clones only, and every original loan and the current package stay untouched. Verifies the new package, each clone and its chain junction row by re-query. Booking the new version still requires nCino\'s Submit for Approval.'
    )
    global static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            out.add(req.inlineExecution == true ? runInline(req) : runRelayed(req));
        }
        return out;
    }

    /** The leg that actually runs the engine. Only a context that can host it gets here. */
    private static Response runInline(Request req) {
        Response res = new Response();
        try {
            res.result = execute(req);
            res.ok = true;
        } catch (ToolException e) {
            res.ok = false;
            res.error = err('VALIDATION_FAILED', e.getMessage(), null, null, false, req.idempotencyKey);
        } catch (C360Facilities.SelectionException e) {
            res.ok = false;
            res.error = err('VALIDATION_FAILED', e.getMessage(), null, null, false, req.idempotencyKey);
        } catch (C360ActionStaging.StagingException e) {
            res.ok = false;
            res.error = err('TOKEN_REFUSED', e.getMessage(), null, null, false, req.idempotencyKey);
        } catch (C360WriteGuard.GuardException e) {
            res.ok = false;
            res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, 'apply_changes_0', false, req.idempotencyKey);
        } catch (EngineException e) {
            res.ok = false;
            res.error = err('ORG_REJECTED_WRITE', 'nCino\'s credit action refused this modification.', e.getMessage(), 'credit_action_0', true, req.idempotencyKey);
        } catch (DmlException e) {
            res.ok = false;
            res.error = err('ORG_REJECTED_WRITE', 'The org refused a write this plan depends on.', e.getMessage(), 'apply_changes_0', true, req.idempotencyKey);
        } catch (QueryException e) {
            res.ok = false;
            res.error = err('READ_FAILED', 'A record this plan depends on could not be read.', e.getMessage(), null, true, req.idempotencyKey);
        }
        return res;
    }

    // -------------------------------------------------------------------------------------------
    // The relay leg, and its two doors.
    //
    // Everything here is read-only until the callout, and there is nothing after it but reading the
    // answer. That is not a style choice: Apex refuses a callout in a transaction that has already
    // done DML, and burning the token here would strand the banker's confirmation on a hop that may
    // never land. The inner leg owns every write.
    // -------------------------------------------------------------------------------------------

    /** The leg the MCP dispatcher reaches. Validates what it can, then hands the work to a door. */
    private static Response runRelayed(Request req) {
        Response res = new Response();
        try {
            cm_Action_Staging__c prior = C360ActionStaging.findCompleted(req.idempotencyKey);
            if (prior != null) {
                res.result = replay(prior);
                res.ok = true;
                return res;
            }
            preflight(req);
        } catch (ToolException e) {
            res.ok = false;
            res.error = err('VALIDATION_FAILED', e.getMessage(), null, null, false, req.idempotencyKey);
            return res;
        } catch (C360ActionStaging.StagingException e) {
            res.ok = false;
            res.error = err('TOKEN_REFUSED', e.getMessage(), null, null, false, req.idempotencyKey);
            return res;
        } catch (QueryException e) {
            res.ok = false;
            res.error = err('READ_FAILED', 'A record this plan depends on could not be read.', e.getMessage(), null, true, req.idempotencyKey);
            return res;
        }
        return callRelay(req);
    }

    /**
     * Every check the outer leg can make without writing: the request shape, the plan belongs to
     * THIS tool, and the token is valid and unconsumed. A bad call is refused before it costs a
     * round trip; a good one leaves the token untouched for the inner leg to burn.
     */
    private static void preflight(Request req) {
        if (String.isBlank(req.idempotencyKey)) {
            throw new ToolException('idempotencyKey is required and must match the key used at stage time.');
        }
        if (String.isBlank(req.stagingId)) {
            throw new ToolException('stagingId is required.');
        }
        if (String.isBlank(req.planHash)) {
            throw new ToolException('planHash is required.');
        }
        cm_Action_Staging__c staged = readStaging(req.stagingId);
        if (staged == null) {
            throw new ToolException('No staging record found for stagingId ' + req.stagingId + '.');
        }
        if (staged.cm_Action_Id__c != ACTION_ID) {
            throw new ToolException(
                'Staging record ' + req.stagingId + ' holds a ' + staged.cm_Action_Id__c + ' plan, not a loan modification. ' +
                'Each execute tool runs its own action or none.'
            );
        }
        C360ActionStaging.assertClaimable(
            req.stagingId, req.planHash, req.decisionToken, C360Plan.asId(req.approverUserId)
        );
    }

    /**
     * Tries the doors in order and returns the first real answer.
     *
     * A door only gets skipped past on a failure that PROVABLY did not reach the action: the session
     * could not be minted, the callout threw, or the endpoint refused authentication. Every other
     * status means the request landed somewhere that could have executed, and is reported rather
     * than retried through a second door.
     */
    private static Response callRelay(Request req) {
        String payload = innerPayload(req);

        Hop viaSelf = selfHop(payload);
        if (viaSelf.body != null) {
            return withPath(readInner(req, viaSelf.body), PATH_SELF);
        }
        if (viaSelf.stop) {
            return unavailable(req, 'self: ' + viaSelf.why);
        }

        Hop viaBox = boxHop(payload);
        if (viaBox.body != null) {
            return withPath(readInner(req, viaBox.body), PATH_BOX);
        }
        return unavailable(req, 'self: ' + viaSelf.why + ' | box: ' + viaBox.why);
    }

    /** One attempt at one door: a body to read, or why it is not one, and whether to try the next. */
    private class Hop {
        String body;
        String why;
        Boolean stop = false;
    }

    /** This door did not answer, and the next one is worth trying: nothing here reached the action. */
    private static Hop refused(String why) {
        Hop h = new Hop();
        h.why = why;
        return h;
    }

    /**
     * This door did not answer and NO other door may be tried. The request landed somewhere that
     * could have executed, so a second attempt at the same plan is not a retry, it is a second run.
     */
    private static Hop halt(String why) {
        Hop h = new Hop();
        h.why = why;
        h.stop = true;
        return h;
    }

    private static Hop answered(String body) {
        Hop h = new Hop();
        h.body = body;
        return h;
    }

    /** The org calling its own Actions API, authenticated by a Visualforce-minted session id. */
    private static Hop selfHop(String payload) {
        String sid;
        try {
            sid = session().sessionId();
        } catch (Exception e) {
            return refused('the session could not be minted (' + e.getTypeName() + ': ' + e.getMessage() + ')');
        }
        if (String.isBlank(sid)) {
            return refused('the session page rendered nothing usable');
        }
        HttpRequest hr = baseRequest(URL.getOrgDomainUrl().toExternalForm() + ACTION_PATH, payload);
        hr.setHeader('Authorization', 'Bearer ' + sid);
        return send(hr, 'the org refused its own session');
    }

    /** The external relay, which re-enters with a proper OAuth token. */
    private static Hop boxHop(String payload) {
        cm_Relay_Config__c cfg = cm_Relay_Config__c.getOrgDefaults();
        if (String.isBlank(cfg.cm_Relay_URL__c) || String.isBlank(cfg.cm_Shared_Secret__c)) {
            return refused('cm_Relay_Config__c carries no URL or no secret');
        }
        HttpRequest hr = baseRequest(cfg.cm_Relay_URL__c, payload);
        hr.setHeader(RELAY_SECRET_HEADER, cfg.cm_Shared_Secret__c);
        return send(hr, 'the relay refused the shared secret');
    }

    private static HttpRequest baseRequest(String endpoint, String payload) {
        HttpRequest hr = new HttpRequest();
        hr.setEndpoint(endpoint);
        hr.setMethod('POST');
        hr.setHeader('Content-Type', 'application/json');
        hr.setTimeout(RELAY_TIMEOUT_MS);
        hr.setBody(payload);
        return hr;
    }

    /**
     * 401 and 403 prove the request was turned away before anything could run, and are the only
     * statuses this falls through on. A callout that threw never reached the host at all, which is
     * equally safe. Every other status halts: the plan is reported unavailable and resumable, and
     * the token fence in the inner leg makes that retry safe even if something did run.
     */
    private static Hop send(HttpRequest hr, String authRefusal) {
        HttpResponse http;
        try {
            http = new Http().send(hr);
        } catch (Exception e) {
            return refused('the door could not be reached (' + e.getTypeName() + ': ' + e.getMessage() + ')');
        }
        Integer status = http.getStatusCode();
        if (status == 401 || status == 403) {
            return refused(authRefusal + ' (HTTP ' + status + ')');
        }
        if (status != 200) {
            return halt('the door answered HTTP ' + status + '. ' + shorten(http.getBody()));
        }
        return answered(http.getBody());
    }

    private static String innerPayload(Request req) {
        return JSON.serialize(new Map<String, Object>{
            'inputs' => new List<Object>{
                new Map<String, Object>{
                    'idempotencyKey' => req.idempotencyKey,
                    'stagingId' => req.stagingId,
                    'planHash' => req.planHash,
                    'decisionToken' => req.decisionToken,
                    'approverUserId' => req.approverUserId,
                    'inlineExecution' => true
                }
            }
        });
    }

    /** Stamps the door onto an answer that came back from it. */
    private static Response withPath(Response res, String path) {
        if (res.result != null) {
            res.result.relayPath = path;
        }
        return res;
    }

    /**
     * Unwraps the Actions API envelope and returns the inner leg's own Response.
     *
     * Past this point the inner leg has RUN. A body we cannot read is therefore never reported as
     * "nothing happened": the token is spent, the staging record is the authority, and the answer
     * says exactly that instead of inviting a retry that would be refused.
     */
    private static Response readInner(Request req, String body) {
        Response res = new Response();
        try {
            List<Object> rows = (List<Object>) JSON.deserializeUntyped(body);
            Map<String, Object> row = (Map<String, Object>) rows[0];
            if (row.get('isSuccess') != true) {
                res.ok = false;
                res.error = err(
                    'ORG_REJECTED_WRITE',
                    'The org refused the relayed execution.',
                    shorten(JSON.serialize(row.get('errors'))),
                    'credit_action_0',
                    true,
                    req.idempotencyKey
                );
                return res;
            }
            return (Response) JSON.deserialize(JSON.serialize(row.get('outputValues')), Response.class);
        } catch (Exception e) {
            res.ok = false;
            res.error = err(
                'READ_FAILED',
                'The relayed execution ran but its answer could not be read back here. Do not retry: the decision ' +
                'token is spent. The staging record for this idempotency key holds what actually happened.',
                e.getTypeName() + ': ' + e.getMessage(),
                null,
                false,
                req.idempotencyKey
            );
            return res;
        }
    }

    /** Nothing was attempted and nothing was written, so the token is still good for a retry. */
    private static Response unavailable(Request req, String detail) {
        Response res = new Response();
        res.ok = false;
        res.error = err('ORG_UNAVAILABLE', RELAY_UNAVAILABLE, detail, 'credit_action_0', true, req.idempotencyKey);
        return res;
    }

    private static String shorten(String s) {
        if (s == null) {
            return null;
        }
        return s.length() > 500 ? s.substring(0, 500) + '...' : s;
    }

    // -------------------------------------------------------------------------------------------
    // The session seam.
    //
    // Page.getContent() returns a blank page in a test context, so the door that depends on it can
    // only be tested through a seam. The default implementation is the real page, so the shipping
    // path is never the stubbed one.
    // -------------------------------------------------------------------------------------------

    /** Where the self-hop's bearer token comes from. */
    public interface SessionSource {
        String sessionId();
    }

    @TestVisible
    private static SessionSource sessionOverride;

    private static SessionSource session() {
        return sessionOverride == null ? new VisualforceSession() : sessionOverride;
    }

    /**
     * An opaque UI session id, minted by rendering a page rather than read off the running request.
     * That is the whole point: the JWT access token a hosted-MCP context runs on is exactly what
     * UserInfo.getSessionId() cannot work with.
     */
    public class VisualforceSession implements SessionSource {
        public String sessionId() {
            String body = Page.C360RelaySession.getContent().toString().trim();
            // A login page, an error page or an empty render is not a session, and must not be sent
            // as one: a malformed bearer would come back as a 401 and be read as "try the next door"
            // when the truth is that this door is broken.
            return (body.length() < 20 || body.contains('<')) ? null : body;
        }
    }

    private static ExecuteResult execute(Request req) {
        if (String.isBlank(req.idempotencyKey)) {
            throw new ToolException('idempotencyKey is required and must match the key used at stage time.');
        }
        if (String.isBlank(req.stagingId)) {
            throw new ToolException('stagingId is required.');
        }
        if (String.isBlank(req.planHash)) {
            throw new ToolException('planHash is required.');
        }

        cm_Action_Staging__c prior = C360ActionStaging.findCompleted(req.idempotencyKey);
        if (prior != null) {
            return replay(prior);
        }

        // The action-id check runs BEFORE the claim on purpose. Consuming a single-use token and only
        // then discovering the plan belongs to another tool would burn the banker's confirmation on a
        // call that was never going to run.
        cm_Action_Staging__c staged = readStaging(req.stagingId);
        if (staged == null) {
            throw new ToolException('No staging record found for stagingId ' + req.stagingId + '.');
        }
        if (staged.cm_Action_Id__c != ACTION_ID) {
            throw new ToolException(
                'Staging record ' + req.stagingId + ' holds a ' + staged.cm_Action_Id__c + ' plan, not a loan modification. ' +
                'Each execute tool runs its own action or none.'
            );
        }

        cm_Action_Staging__c stg = C360ActionStaging.claimForExecute(
            req.stagingId, req.planHash, req.decisionToken, C360Plan.asId(req.approverUserId)
        );

        List<C360Plan.Step> steps = C360Plan.deserializeSteps(stg.cm_Plan_JSON__c);
        Map<String, Object> v = C360Plan.deserializeValues(stg.cm_Plan_JSON__c);

        Id packageId = C360Plan.asId(v.get('productPackageId'));
        Decimal declaredCount = C360Plan.asDecimal(v.get('facilityCount'));
        Integer n = declaredCount == null ? 1 : Integer.valueOf(declaredCount);

        List<Id> parents = new List<Id>();
        for (Integer i = 0; i < n; i++) {
            Id fid = C360Plan.asId(v.get('facility' + i + '.loanId'));
            if (fid == null) {
                String detail = 'The staged plan is missing facility ' + i + '. Re-stage the action.';
                C360Plan.markRefused(steps, detail);
                C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
                throw new ToolException(detail);
            }
            parents.add(fid);
        }

        // Resume precondition (A33.3.3): re-read every target before any write, so a run never acts on
        // org state that moved since staging. The valid-facility rule is re-applied here rather than
        // assumed from stage time, because a facility can be closed or re-staged in between.
        List<LLC_BI__Loan__c> before;
        try {
            before = C360Facilities.validate(readFacilities(parents), parents, packageId, 'Modifications');
        } catch (C360Facilities.SelectionException e) {
            C360Plan.markRefused(steps, e.getMessage());
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw e;
        }
        Map<Id, LLC_BI__Loan__c> beforeById = new Map<Id, LLC_BI__Loan__c>(before);

        // The staged covenant-add count, read up front so every failure branch can settle those
        // steps rather than leaving them dangling as pending.
        Decimal covAddCountRaw = C360Plan.asDecimal(v.get('covenantAddCount'));
        Integer covenantAddCount = covAddCountRaw == null ? 0 : Integer.valueOf(covAddCountRaw);

        // The staged roll list. nCino package methodology: the credit action versions the WHOLE
        // package, so the plan carries every eligible member, not just the selected ones. The
        // membership was computed and hashed at stage time; it is re-derived here (resume
        // precondition A33.3.3) and a mismatch refuses the run, because a package whose membership
        // moved between staging and execution is not the package the banker confirmed.
        List<Id> rollMembers = new List<Id>();
        String rollCsv = v.get('rollMemberIds') == null ? null : String.valueOf(v.get('rollMemberIds'));
        if (String.isNotBlank(rollCsv)) {
            for (String rid : rollCsv.split(',')) {
                Id asId = C360Plan.asId(rid.trim());
                if (asId != null) {
                    rollMembers.add(asId);
                }
            }
        }
        if (rollMembers.isEmpty()) {
            String detail = 'This plan was staged before the package-versioning wave and carries no roll list. ' +
                'Re-stage the action: a modification rolls the whole package, and the banker confirms that shape at stage time.';
            C360Plan.markRefused(steps, detail);
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException(detail);
        }
        Set<Id> rollSet = new Set<Id>(rollMembers);
        Set<Id> nowEligible = new Set<Id>();
        for (LLC_BI__Loan__c m : [
            SELECT Id FROM LLC_BI__Loan__c
            WHERE LLC_BI__Product_Package__c = :packageId
              AND LLC_BI__Stage__c = 'Booked' AND LLC_BI__Status__c = 'Open'
            WITH USER_MODE
        ]) {
            nowEligible.add(m.Id);
        }
        if (!nowEligible.equals(rollSet)) {
            String detail = 'The package membership moved between staging and execution: the plan rolls ' +
                rollSet.size() + ' members but the package now holds ' + nowEligible.size() +
                ' eligible members. Re-stage the action so the banker confirms the package as it stands now.';
            C360Plan.markRefused(steps, detail);
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new ToolException(detail);
        }

        // Everything on the chain before we act, so a pre-existing modification is never mistaken for
        // the one this run produced. Revision 0 is a self-referential anchor row (ACTIONS-DESIGN 1.4),
        // and any of the rolled members may already carry earlier revisions.
        Set<Id> junctionsBefore = new Set<Id>();
        for (LLC_BI__LoanRenewal__c j : [
            SELECT Id FROM LLC_BI__LoanRenewal__c WHERE LLC_BI__ParentLoanId__c IN :rollMembers WITH USER_MODE
        ]) {
            junctionsBefore.add(j.Id);
        }

        EngineResult engineResult = engine().modify(packageId, rollMembers);
        if (engineResult.success != true) {
            String why = engineResult.failureReasons == null || engineResult.failureReasons.isEmpty()
                ? 'The engine returned no failure reason.'
                : String.join(engineResult.failureReasons, ' | ');
            C360Plan.setState(steps, 'roll_package', C360Plan.STATE_FAILED, 'nCino refused the credit action: ' + why);
            for (Integer i = 0; i < n; i++) {
                C360Plan.setState(steps, 'credit_action_' + i, C360Plan.STATE_FAILED, 'nCino refused the credit action: ' + why);
                C360Plan.setState(steps, 'verify_clone_' + i, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'apply_changes_' + i, C360Plan.STATE_SKIPPED, null);
            }
            C360Plan.setState(steps, 'verify_package', C360Plan.STATE_SKIPPED, null);
            C360Plan.setState(steps, 'carry_junctions', C360Plan.STATE_SKIPPED, null);
            for (Integer ci = 0; ci < covenantAddCount; ci++) {
                C360Plan.setState(steps, 'covenant_create_' + ci, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'covenant_attach_' + ci, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'covenant_verify_' + ci, C360Plan.STATE_SKIPPED, null);
            }
            C360Plan.setState(steps, 'held_execution', C360Plan.STATE_SKIPPED, null);
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_FAILED, null);
            throw new EngineException(why);
        }

        // The versioning contract: the engine must have minted a NEW package. A result that points
        // back at the source package is the old single-loan anchoring, which the package methodology
        // forbids, and nothing downstream may pretend otherwise.
        Id newPkgId = String.isBlank(engineResult.outputPackageId) ? null : (Id) engineResult.outputPackageId;
        if (newPkgId == null || newPkgId == packageId) {
            String why = newPkgId == null
                ? 'The engine reported success but named no output package, so the new version cannot be verified.'
                : 'The engine reported the SOURCE package as its output instead of a new version. The clones, if any, are anchored wrongly.';
            C360Plan.setState(steps, 'roll_package', C360Plan.STATE_FILED_UNVERIFIED, why);
            for (Integer i = 0; i < n; i++) {
                C360Plan.setState(steps, 'credit_action_' + i, C360Plan.STATE_FILED_UNVERIFIED, why);
                C360Plan.setState(steps, 'verify_clone_' + i, C360Plan.STATE_FAILED, why);
                C360Plan.setState(steps, 'apply_changes_' + i, C360Plan.STATE_SKIPPED, null);
            }
            C360Plan.setState(steps, 'verify_package', C360Plan.STATE_FAILED, why);
            C360Plan.setState(steps, 'carry_junctions', C360Plan.STATE_SKIPPED, null);
            for (Integer ci = 0; ci < covenantAddCount; ci++) {
                C360Plan.setState(steps, 'covenant_create_' + ci, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'covenant_attach_' + ci, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'covenant_verify_' + ci, C360Plan.STATE_SKIPPED, null);
            }
            C360Plan.setState(steps, 'held_execution', C360Plan.STATE_SKIPPED, null);
            C360ActionStaging.recordOutcome(stg, steps, C360Plan.TERMINAL_PARTIAL, null);
            throw new EngineException(why);
        }
        C360Plan.setState(steps, 'roll_package', C360Plan.STATE_VERIFIED,
            'nCino created package version ' + newPkgId + ' from one credit action over ' + rollMembers.size() + ' members.');

        // Map clone to parent through the chain, never through "the newest loan on the package": two
        // facilities modified in one call would race, and a duplicate produced by failed background
        // Apex would win.
        Map<Id, LLC_BI__LoanRenewal__c> newestByParent = new Map<Id, LLC_BI__LoanRenewal__c>();
        for (LLC_BI__LoanRenewal__c j : [
            SELECT Id, Name, LLC_BI__ParentLoanId__c, LLC_BI__RenewalLoanId__c,
                   LLC_BI__RevisionNumber__c, LLC_BI__RevisionStatus__c
            FROM LLC_BI__LoanRenewal__c
            WHERE LLC_BI__ParentLoanId__c IN :rollMembers
            WITH USER_MODE
        ]) {
            if (junctionsBefore.contains(j.Id)) {
                continue;
            }
            if (j.LLC_BI__RenewalLoanId__c == null || j.LLC_BI__RenewalLoanId__c == j.LLC_BI__ParentLoanId__c) {
                continue;
            }
            LLC_BI__LoanRenewal__c held = newestByParent.get(j.LLC_BI__ParentLoanId__c);
            if (held == null || revision(j) > revision(held)) {
                newestByParent.put(j.LLC_BI__ParentLoanId__c, j);
            }
        }

        Set<Id> cloneIds = new Set<Id>();
        for (LLC_BI__LoanRenewal__c j : newestByParent.values()) {
            cloneIds.add(j.LLC_BI__RenewalLoanId__c);
        }
        Map<Id, LLC_BI__Loan__c> clones = new Map<Id, LLC_BI__Loan__c>(readLoans(cloneIds));

        // Package-level verification: the new version exists and carries a clone for EVERY rolled
        // member. The junction graphs are copied by nCino's own queueable jobs after this transaction
        // commits, so they are reported as queued in observe_side_effects, never claimed here.
        List<LLC_BI__Product_Package__c> newPkgRows = [
            SELECT Id, Name, LLC_BI__Account__c FROM LLC_BI__Product_Package__c WHERE Id = :newPkgId WITH USER_MODE LIMIT 1
        ];
        Integer clonesOnNew = [
            SELECT COUNT() FROM LLC_BI__Loan__c WHERE LLC_BI__Product_Package__c = :newPkgId WITH USER_MODE
        ];
        String newPkgName = newPkgRows.isEmpty() ? null : newPkgRows[0].Name;

        // The engine names the version itself and hangs it on NO account (verified live 2026-08-30:
        // the created package carries a null LLC_BI__Account__c, which is also why its name prefix
        // comes out blank as "- 8/30/2026 - PP"). The org's own convention is "<Account> - <M/D/YYYY>
        // - PP" (516 of 518 packages), so both are repaired here and anything else is left exactly
        // as the engine wrote it.
        if (!newPkgRows.isEmpty()) {
            List<Account> acct = [
                SELECT Name FROM Account WHERE Id = :before[0].LLC_BI__Account__c WITH USER_MODE LIMIT 1
            ];
            Boolean nameNeedsRepair = newPkgName != null && newPkgName.startsWith('- ')
                && !acct.isEmpty() && String.isNotBlank(acct[0].Name);
            Boolean accountNeedsRepair = newPkgRows[0].LLC_BI__Account__c == null;
            if (nameNeedsRepair || accountNeedsRepair) {
                LLC_BI__Product_Package__c repair = new LLC_BI__Product_Package__c(Id = newPkgId);
                Map<String, Object> pkgFields = new Map<String, Object>();
                if (nameNeedsRepair) {
                    String repaired = acct[0].Name + ' ' + newPkgName;
                    if (repaired.length() > 80) {
                        repaired = repaired.substring(0, 80);
                    }
                    repair.Name = repaired;
                    pkgFields.put('Name', repaired);
                    newPkgName = repaired;
                }
                if (accountNeedsRepair) {
                    repair.LLC_BI__Account__c = before[0].LLC_BI__Account__c;
                    pkgFields.put('LLC_BI__Account__c', before[0].LLC_BI__Account__c);
                }
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PRODUCT_PACKAGE, C360WriteGuard.OP_UPDATE, pkgFields);
                update as user repair;
            }
        }

        Boolean packageProven = !newPkgRows.isEmpty() && clonesOnNew == rollMembers.size();
        C360Plan.setState(
            steps,
            'verify_package',
            packageProven ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
            newPkgRows.isEmpty()
                ? 'The engine named package ' + newPkgId + ' but it could not be read back.'
                : 'Package version ' + newPkgName + ' (' + newPkgId + ') reads back with ' + clonesOnNew + ' of ' +
                  rollMembers.size() + ' rolled members' +
                  (packageProven ? '.' : ', which is NOT the full roll. Each missing member is reported against its own facility.')
        );

        // ---- The junction carry. nCino's engine copies NOTHING here: the related-lists copy
        // configuration only ever fed the retired classic wizard's checklist (verified live
        // 2026-08-30: all eight defaults flipped on, engine run, zero junction rows landed, no copy
        // job enqueued). Package methodology requires every member's graph to carry onto the new
        // version, so this tool composes the carry itself: replicas of the parents' covenant
        // junctions, collateral pledges (with a fresh per-clone aggregate shell) and borrowing
        // involvements, retargeted at the clones, synchronous, and verified by count below.
        Map<Id, Id> cloneByParent = new Map<Id, Id>();
        for (Id parentId : newestByParent.keySet()) {
            cloneByParent.put(parentId, newestByParent.get(parentId).LLC_BI__RenewalLoanId__c);
        }
        String carryReport = carryJunctionGraph(rollMembers, cloneByParent, newPkgId);
        C360Plan.setState(
            steps,
            'carry_junctions',
            carryReport.startsWith('CARRIED') ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
            carryReport.removeStart('CARRIED ')
        );

        // The staged changes, exactly as the banker saw them hashed at the confirm gate.
        Decimal requestedAmount = C360Plan.asDecimal(v.get('requestedAmount'));
        Date requestedMaturity = C360Plan.asDate(v.get('requestedMaturityDate'));
        Decimal requestedRate = C360Plan.asDecimal(v.get('requestedRate'));
        Decimal requestedTerm = C360Plan.asDecimal(v.get('requestedTermMonths'));

        List<LLC_BI__Loan__c> toUpdate = new List<LLC_BI__Loan__c>();
        for (Integer i = 0; i < n; i++) {
            Id parentId = parents[i];
            LLC_BI__LoanRenewal__c junction = newestByParent.get(parentId);
            LLC_BI__Loan__c clone = junction == null ? null : clones.get(junction.LLC_BI__RenewalLoanId__c);
            String s = String.valueOf(i);

            if (clone == null) {
                C360Plan.setState(
                    steps, 'credit_action_' + s, C360Plan.STATE_FILED_UNVERIFIED,
                    junction == null
                        ? 'The engine reported success but no new chain row appeared for this facility. Nothing is claimed for it.'
                        : 'Chain row ' + junction.Name + ' appeared but the facility it points at could not be read back.'
                );
                C360Plan.setState(steps, 'verify_clone_' + s, C360Plan.STATE_FAILED, 'No modification facility could be read for this parent.');
                C360Plan.setState(steps, 'apply_changes_' + s, C360Plan.STATE_SKIPPED, null);
                continue;
            }

            C360Plan.setState(steps, 'credit_action_' + s, C360Plan.STATE_VERIFIED,
                'nCino created modification facility ' + clone.Id + ' from ' + beforeById.get(parentId).Name + '.');

            LLC_BI__Loan__c fields = new LLC_BI__Loan__c(Id = clone.Id);
            Map<String, Object> writeFields = new Map<String, Object>();
            if (requestedAmount != null) {
                fields.LLC_BI__Amount__c = requestedAmount;
                writeFields.put('LLC_BI__Amount__c', requestedAmount);
            }
            if (requestedMaturity != null) {
                fields.LLC_BI__Maturity_Date__c = requestedMaturity;
                writeFields.put('LLC_BI__Maturity_Date__c', requestedMaturity);
            }
            if (requestedRate != null) {
                fields.LLC_BI__InterestRate__c = requestedRate;
                writeFields.put('LLC_BI__InterestRate__c', requestedRate);
            }
            if (requestedTerm != null) {
                fields.LLC_BI__Term_Months__c = requestedTerm;
                writeFields.put('LLC_BI__Term_Months__c', requestedTerm);
            }
            // The fence still runs even though no stage field is present: it is the single gate every
            // domain write in this package passes through, and it is what refuses a forbidden field
            // or a stage hop if this method ever grows one.
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN, C360WriteGuard.OP_UPDATE, writeFields);
            toUpdate.add(fields);
        }

        if (!toUpdate.isEmpty()) {
            update as user toUpdate;
        }

        // ---- Net-new covenants (plan values covenantAdd{i}.*). Created on the borrower account,
        // attached to the CLONE of the targeted member on the new version — never to the booked
        // parent. Probed safe 2026-08-30: a Covenant2 insert plus its junction mints no compliance
        // row, starts no approval and sends no email; the org's own review cycle owns the schedule
        // from here. Each add is created Pending and Active, with the org's mirrored operator and
        // threshold fields written the way Hartwell's own covenants carry them.
        List<CovenantResult> covenantResults = new List<CovenantResult>();
        for (Integer i = 0; i < covenantAddCount; i++) {
            String cs = String.valueOf(i);
            CovenantResult cr = new CovenantResult();
            cr.typeName = String.valueOf(v.get('covenantAdd' + cs + '.typeName'));
            cr.threshold = C360Plan.asDecimal(v.get('covenantAdd' + cs + '.threshold'));
            cr.operator = String.valueOf(v.get('covenantAdd' + cs + '.operator'));
            covenantResults.add(cr);

            Id covTypeId = C360Plan.asId(v.get('covenantAdd' + cs + '.typeId'));
            String covFrequency = String.valueOf(v.get('covenantAdd' + cs + '.frequency'));
            Date covEffective = C360Plan.asDate(v.get('covenantAdd' + cs + '.effectiveDate'));
            Id covTargetParent = C360Plan.asId(v.get('covenantAdd' + cs + '.targetLoanId'));
            LLC_BI__LoanRenewal__c covTargetJunction = newestByParent.get(covTargetParent);
            Id covCloneId = covTargetJunction == null ? null : covTargetJunction.LLC_BI__RenewalLoanId__c;

            if (covCloneId == null || covTypeId == null || cr.threshold == null) {
                String covWhy = covCloneId == null
                    ? 'No modification clone could be read for the facility this covenant targets, so the covenant was not created.'
                    : 'The staged covenant add is incomplete (type or threshold missing), so nothing was created. Re-stage the action.';
                C360Plan.setState(steps, 'covenant_create_' + cs, C360Plan.STATE_FAILED, covWhy);
                C360Plan.setState(steps, 'covenant_attach_' + cs, C360Plan.STATE_SKIPPED, null);
                C360Plan.setState(steps, 'covenant_verify_' + cs, C360Plan.STATE_FAILED, covWhy);
                cr.verification = covWhy;
                continue;
            }

            Map<String, Object> covFields = new Map<String, Object>{
                'LLC_BI__Account__c' => before[0].LLC_BI__Account__c,
                'LLC_BI__Covenant_Type__c' => covTypeId,
                'LLC_BI__Financial_Indicator_Value__c' => cr.threshold,
                'Acnpex_Threshold_Value__c' => cr.threshold,
                'Financial_Indicator_Operator__c' => FI_OPERATOR.get(cr.operator),
                'Acnpex_Operator__c' => cr.operator,
                'LLC_BI__Frequency__c' => covFrequency,
                'LLC_BI__Effective_Date__c' => covEffective,
                'LLC_BI__Covenant_Status__c' => 'Pending',
                'LLC_BI__Active__c' => 'true'
            };
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_COVENANT, C360WriteGuard.OP_CREATE, covFields);
            LLC_BI__Covenant2__c cov = new LLC_BI__Covenant2__c(
                LLC_BI__Account__c = before[0].LLC_BI__Account__c,
                LLC_BI__Covenant_Type__c = covTypeId,
                LLC_BI__Financial_Indicator_Value__c = cr.threshold,
                Acnpex_Threshold_Value__c = cr.threshold,
                Financial_Indicator_Operator__c = FI_OPERATOR.get(cr.operator),
                Acnpex_Operator__c = cr.operator,
                LLC_BI__Frequency__c = covFrequency,
                LLC_BI__Effective_Date__c = covEffective,
                LLC_BI__Covenant_Status__c = 'Pending',
                LLC_BI__Active__c = true
            );
            insert as user cov;
            C360Plan.setState(steps, 'covenant_create_' + cs, C360Plan.STATE_VERIFIED,
                'Covenant ' + cov.Id + ' created: ' + cr.typeName + ' ' + cr.operator + ' ' + String.valueOf(cr.threshold) + '.');

            Map<String, Object> attachFields = new Map<String, Object>{
                'LLC_BI__Loan__c' => covCloneId,
                'LLC_BI__Covenant2__c' => cov.Id
            };
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_COVENANT, C360WriteGuard.OP_CREATE, attachFields);
            LLC_BI__Loan_Covenant__c attach = new LLC_BI__Loan_Covenant__c(
                LLC_BI__Loan__c = covCloneId,
                LLC_BI__Covenant2__c = cov.Id
            );
            insert as user attach;
            C360Plan.setState(steps, 'covenant_attach_' + cs, C360Plan.STATE_VERIFIED,
                'Junction ' + attach.Id + ' attaches it to clone ' + covCloneId + '.');

            // The proof is the re-read, never the insert result.
            List<LLC_BI__Covenant2__c> covBack = [
                SELECT Id, Name, LLC_BI__Financial_Indicator_Value__c, LLC_BI__Covenant_Status__c
                FROM LLC_BI__Covenant2__c WHERE Id = :cov.Id WITH USER_MODE LIMIT 1
            ];
            Integer attachBack = [
                SELECT COUNT() FROM LLC_BI__Loan_Covenant__c
                WHERE LLC_BI__Loan__c = :covCloneId AND LLC_BI__Covenant2__c = :cov.Id
                WITH USER_MODE
            ];
            Boolean covProven = !covBack.isEmpty()
                && covBack[0].LLC_BI__Financial_Indicator_Value__c == cr.threshold
                && attachBack == 1;
            cr.covenantId = cov.Id;
            cr.covenantName = covBack.isEmpty() ? null : covBack[0].Name;
            cr.cloneLoanId = covCloneId;
            cr.verification = covBack.isEmpty()
                ? 'The covenant could not be read back after creation.'
                : 'Covenant ' + covBack[0].Name + ' reads back at ' + String.valueOf(covBack[0].LLC_BI__Financial_Indicator_Value__c) +
                  ', status ' + covBack[0].LLC_BI__Covenant_Status__c + ', with ' + attachBack + ' junction on the clone.';
            C360Plan.setState(
                steps,
                'covenant_verify_' + cs,
                covProven ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
                cr.verification
            );
        }

        // Re-read everything the plan claims: the clones after the change, and the parents, which this
        // tool must not have moved at all.
        Map<Id, LLC_BI__Loan__c> clonesAfter = new Map<Id, LLC_BI__Loan__c>(readLoans(cloneIds));
        Map<Id, LLC_BI__Loan__c> parentsAfter = new Map<Id, LLC_BI__Loan__c>(readLoans(new Set<Id>(parents)));

        List<FacilityResult> results = new List<FacilityResult>();
        Id firstCloneId = null;
        for (Integer i = 0; i < n; i++) {
            Id parentId = parents[i];
            String s = String.valueOf(i);
            LLC_BI__Loan__c parentBefore = beforeById.get(parentId);
            LLC_BI__LoanRenewal__c junction = newestByParent.get(parentId);

            FacilityResult fr = new FacilityResult();
            fr.facilityId = parentId;
            fr.facilityName = parentBefore.Name;
            results.add(fr);

            if (junction == null || !clonesAfter.containsKey(junction.LLC_BI__RenewalLoanId__c)) {
                fr.verification = 'No modification facility could be read back for this parent, so nothing is claimed for it.';
                fr.outcome = 'The credit action produced nothing verifiable for ' + parentBefore.Name + '.';
                fr.parentUnchanged = parentUnchanged(parentBefore, parentsAfter.get(parentId));
                continue;
            }

            LLC_BI__Loan__c clone = clonesAfter.get(junction.LLC_BI__RenewalLoanId__c);
            if (firstCloneId == null) {
                firstCloneId = clone.Id;
            }

            fr.cloneLoanId = clone.Id;
            fr.cloneName = clone.Name;
            fr.cloneLookupKey = clone.LLC_BI__lookupKey__c;
            fr.cloneStage = clone.LLC_BI__Stage__c;
            fr.junctionId = junction.Id;
            fr.junctionName = junction.Name;
            fr.revisionNumber = junction.LLC_BI__RevisionNumber__c;
            fr.parentUnchanged = parentUnchanged(parentBefore, parentsAfter.get(parentId));

            List<String> proven = new List<String>();
            List<String> unproven = new List<String>();
            if (clone.LLC_BI__Is_Modification__c == true) {
                proven.add('the clone reads back with Is_Modification true');
            } else {
                unproven.add('the clone does NOT carry Is_Modification, so nCino may have typed it as an original loan');
            }
            if (clone.LLC_BI__Product_Package__c == newPkgId) {
                proven.add('it sits on the new package version ' + newPkgId);
            } else {
                unproven.add('it sits on package ' + clone.LLC_BI__Product_Package__c + ', not the new package version ' + newPkgId);
            }
            if (revision(junction) >= 1) {
                proven.add('chain row ' + junction.Name + ' records revision ' + String.valueOf(junction.LLC_BI__RevisionNumber__c));
            } else {
                unproven.add('the only chain row found is the revision 0 anchor, which is not a modification');
            }
            if (fr.parentUnchanged == true) {
                proven.add('the parent re-reads unchanged at ' + parentBefore.LLC_BI__Stage__c + ' / ' + parentBefore.LLC_BI__Status__c);
            } else {
                unproven.add('the parent did NOT re-read unchanged, which this tool never intends');
            }

            fr.verification = String.join(proven, '; ') +
                (unproven.isEmpty() ? '.' : '. Not proven: ' + String.join(unproven, '; ') + '.');
            C360Plan.setState(
                steps,
                'verify_clone_' + s,
                unproven.isEmpty() ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
                fr.verification
            );

            fr.appliedChanges = applied(clone, requestedAmount, requestedMaturity, requestedRate, requestedTerm);
            Boolean everythingLanded = !fr.appliedChanges.contains('did not land');
            C360Plan.setState(
                steps,
                'apply_changes_' + s,
                everythingLanded ? C360Plan.STATE_VERIFIED : C360Plan.STATE_FILED_UNVERIFIED,
                fr.appliedChanges
            );

            fr.outcome = 'Modification ' + clone.Name + ' created from ' + parentBefore.Name + ' on the new package version at stage ' +
                clone.LLC_BI__Stage__c + '. ' + fr.appliedChanges + ' The parent was not touched.';
        }

        // Informational by contract (A33.3.2): surfaced to the banker, decides nothing, and is never
        // claimed as verified because no verification step proves it.
        C360Plan.setState(
            steps,
            'observe_side_effects',
            C360Plan.STATE_FILED_UNVERIFIED,
            'Stage-driven email alerts and memo status changes run org-side on their own transactions and report nothing back here.'
        );
        C360Plan.setState(steps, 'held_execution', C360Plan.STATE_VERIFIED, BOOKING_HANDOFF);

        String terminal = C360Plan.terminalState(steps);
        C360ActionStaging.recordOutcome(stg, steps, terminal, firstCloneId);

        ExecuteResult out = new ExecuteResult();
        out.stagingId = stg.Id;
        out.cloneLoanId = firstCloneId;
        out.recordName = results.isEmpty() ? null : results[0].cloneName;
        out.anchorName = results.isEmpty() ? null : results[0].facilityName;
        out.productPackageId = packageId;
        out.outputPackageId = engineResult.outputPackageId;
        out.newPackageName = newPkgName;
        out.membersRolled = rollMembers.size();
        out.covenants = covenantResults;
        out.terminalState = terminal;
        out.steps = toWireSteps(steps);
        out.bookingHandoff = BOOKING_HANDOFF;
        out.facilities = results;
        out.facilityCount = results.size();
        out.replayed = false;
        out.outcome = 'New package version ' + (newPkgName == null ? String.valueOf(newPkgId) : newPkgName) +
            ' created: ' + rollMembers.size() + ' members rolled, ' + results.size() + ' modified' +
            (covenantResults.isEmpty() ? '' : ', ' + covenantResults.size() + ' net-new covenant' +
                (covenantResults.size() == 1 ? '' : 's') + ' attached to the clone' + (covenantResults.size() == 1 ? '' : 's')) + '. ' +
            (results.size() == 1
                ? results[0].outcome
                : 'See each facility for its clone and what was applied.') +
            ' ' + BOOKING_HANDOFF;
        return out;
    }

    /** An idempotent replay reports the prior run and writes nothing. */
    private static ExecuteResult replay(cm_Action_Staging__c prior) {
        ExecuteResult r = new ExecuteResult();
        r.stagingId = prior.Id;
        r.cloneLoanId = prior.cm_Result_Record_Id__c;
        r.recordName = nameOf(prior.cm_Result_Record_Id__c);
        r.terminalState = prior.cm_Status__c == 'Completed' ? C360Plan.TERMINAL_SUCCESS : C360Plan.TERMINAL_PARTIAL;
        r.replayed = true;
        r.bookingHandoff = BOOKING_HANDOFF;
        r.outcome = 'This idempotency key already produced modification facility ' + prior.cm_Result_Record_Id__c +
            '. Nothing was written. ' + BOOKING_HANDOFF;
        r.steps = prior.cm_Tracker_JSON__c == null
            ? new List<StepResult>()
            : toWireSteps((List<C360Plan.Step>) JSON.deserialize(prior.cm_Tracker_JSON__c, List<C360Plan.Step>.class));
        return r;
    }

    // -------------------------------------------------------------------------------------------
    // The engine seam.
    //
    // The bean is a managed-package service that clones loans and writes chain rows. It is not a
    // thing a unit test can honestly stand up, and stubbing it lets the tests prove what IS ours:
    // the token gate, the chain mapping, the verification and the idempotency fence. The default
    // implementation is the real door, so the shipping path is never the stubbed one.
    // -------------------------------------------------------------------------------------------

    /** What nCino's credit-action service answers, in our own shape. */
    public class EngineResult {
        public Boolean success;
        public String outputPackageId;
        public List<String> failureReasons;

        public EngineResult() {
            this.success = false;
            this.failureReasons = new List<String>();
        }
    }

    /** The credit-action door. One implementation calls nCino; the test stub stands in for it. */
    public interface CreditActionEngine {
        EngineResult modify(Id packageId, List<Id> facilityIds);
    }

    @TestVisible
    private static CreditActionEngine engineOverride;

    private static CreditActionEngine engine() {
        return engineOverride == null ? new NcinoCreditActionEngine() : engineOverride;
    }

    /**
     * nCino's cross-package credit action, in-process and synchronous.
     *
     * isAsync is false deliberately. The async path returns an AsyncApexJob id and nothing else, so
     * the verification this tool exists to perform would have to happen in a transaction that cannot
     * see the result, and PDI-00017266 says an async failure can revert everything with no error at
     * all. Synchronous costs CPU and buys an observable outcome.
     */
    public class NcinoCreditActionEngine implements CreditActionEngine {
        public EngineResult modify(Id packageId, List<Id> facilityIds) {
            EngineResult out = new EngineResult();
            List<Map<String, Object>> actions = new List<Map<String, Object>>();
            for (Id fid : facilityIds) {
                actions.add(new Map<String, Object>{ 'contextId' => String.valueOf(fid), 'actionType' => ACTION_TYPE });
            }

            try {
                Object bean = nFORCE.BeanFactory.getInstance().getBeanByUniqueName(BEAN_NAME);
                if (bean == null) {
                    // Observed 2026-08-22: the factory returns null inside a TEST context, which is why
                    // the suite stubs this seam. At runtime it returns the service.
                    out.failureReasons.add('The bean factory returned no ' + BEAN_NAME + ' service in this context.');
                    return out;
                }
                nFORCE.ACrossPackageService service = (nFORCE.ACrossPackageService) bean;
                service.setInputParameter('contextId', String.valueOf(packageId));
                service.setInputParameter('facilityActions', JSON.serialize(actions));
                service.setInputParameter('isAsync', false);
                // Package methodology: the credit action mints the NEXT VERSION of the package, never
                // an insert into the current one. Shape probe 2026-08-30 (rolled back): with this flag
                // the engine creates the new package, clones every facility in facilityActions onto it
                // with _M<n> lookup keys at Qualification/Open, writes the chain rows synchronously and
                // queues the junction-graph copy. It also names the package itself; a newPackageName
                // input was observed to be IGNORED, which is why the caller repairs the name after.
                service.setInputParameter('isNewPackage', true);
                service.executeService();

                Map<String, Object> params = service.getOutputParameters();
                if (params == null) {
                    out.failureReasons.add('The credit-action service returned no output parameters.');
                    return out;
                }
                out.success = params.get('success') == true;
                out.outputPackageId = params.get('outputPackageId') == null ? null : String.valueOf(params.get('outputPackageId'));
                Object reasons = params.get('failureReasons');
                if (reasons instanceof List<Object>) {
                    for (Object o : (List<Object>) reasons) {
                        if (o != null) {
                            out.failureReasons.add(String.valueOf(o));
                        }
                    }
                }
            } catch (Exception e) {
                // Anything the managed package throws is an ORG answer, not a fault of ours, and the
                // banker gets the org's own words rather than a stack trace.
                out.success = false;
                out.failureReasons.add(e.getTypeName() + ': ' + e.getMessage());
            }
            return out;
        }
    }

    // -------------------------------------------------------------------------------------------
    // The junction carry.
    // -------------------------------------------------------------------------------------------

    /**
     * Replicates the junction graph of every rolled parent onto its clone: covenant junctions,
     * collateral pledges (each clone gets a fresh aggregate shell, because aggregates are per-loan
     * rollup anchors and reusing the parent's would cross the versions), and borrowing involvements
     * retargeted at the clone and the new package. Values are COPIES of org state, never authored;
     * the OP_CARRY gate fences the objects and the fields the org derives.
     *
     * @return 'CARRIED <detail>' when every replica read back by count; a plain detail otherwise.
     */
    private static String carryJunctionGraph(List<Id> parents, Map<Id, Id> cloneByParent, Id newPkgId) {
        List<LLC_BI__Loan_Covenant__c> covCopies = new List<LLC_BI__Loan_Covenant__c>();
        for (LLC_BI__Loan_Covenant__c j : [
            SELECT LLC_BI__Loan__c, LLC_BI__Covenant2__c
            FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN :parents WITH USER_MODE
        ]) {
            Id cloneId = cloneByParent.get(j.LLC_BI__Loan__c);
            if (cloneId == null) {
                continue;
            }
            covCopies.add(new LLC_BI__Loan_Covenant__c(LLC_BI__Loan__c = cloneId, LLC_BI__Covenant2__c = j.LLC_BI__Covenant2__c));
        }
        if (!covCopies.isEmpty()) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_COVENANT, C360WriteGuard.OP_CARRY,
                new Map<String, Object>{ 'LLC_BI__Loan__c' => null, 'LLC_BI__Covenant2__c' => null });
            insert as user covCopies;
        }

        List<LLC_BI__Loan_Collateral2__c> pledgeSources = [
            SELECT LLC_BI__Loan__c, LLC_BI__Collateral__c, LLC_BI__Lien_Position__c, LLC_BI__Pledged_Status__c,
                   LLC_BI__Active__c, LLC_BI__Is_Primary__c, LLC_BI__Amount_Pledged__c,
                   LLC_BI__Advance_Rate_Override__c, LLC_BI__Override_Reason__c, LLC_BI__Start_Date__c,
                   LLC_BI__End_Date__c, LLC_BI__Is_Excluded__c, LLC_BI__Is_Leased_Asset__c,
                   LLC_BI__Abundance_of_Caution__c
            FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN :parents WITH USER_MODE
        ];
        Map<Id, LLC_BI__Loan_Collateral_Aggregate__c> aggByClone = new Map<Id, LLC_BI__Loan_Collateral_Aggregate__c>();
        for (LLC_BI__Loan_Collateral2__c p : pledgeSources) {
            Id cloneId = cloneByParent.get(p.LLC_BI__Loan__c);
            if (cloneId == null || aggByClone.containsKey(cloneId)) {
                continue;
            }
            aggByClone.put(cloneId, new LLC_BI__Loan_Collateral_Aggregate__c(Name = 'Collateral Aggregate'));
        }
        if (!aggByClone.isEmpty()) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PLEDGE_AGGREGATE, C360WriteGuard.OP_CARRY,
                new Map<String, Object>{ 'Name' => null });
            insert as user aggByClone.values();
        }
        List<LLC_BI__Loan_Collateral2__c> pledgeCopies = new List<LLC_BI__Loan_Collateral2__c>();
        for (LLC_BI__Loan_Collateral2__c p : pledgeSources) {
            Id cloneId = cloneByParent.get(p.LLC_BI__Loan__c);
            if (cloneId == null) {
                continue;
            }
            pledgeCopies.add(new LLC_BI__Loan_Collateral2__c(
                LLC_BI__Loan__c = cloneId,
                LLC_BI__Collateral__c = p.LLC_BI__Collateral__c,
                LLC_BI__Loan_Collateral_Aggregate__c = aggByClone.get(cloneId).Id,
                LLC_BI__Lien_Position__c = p.LLC_BI__Lien_Position__c,
                LLC_BI__Pledged_Status__c = p.LLC_BI__Pledged_Status__c,
                LLC_BI__Active__c = p.LLC_BI__Active__c,
                LLC_BI__Is_Primary__c = p.LLC_BI__Is_Primary__c,
                LLC_BI__Amount_Pledged__c = p.LLC_BI__Amount_Pledged__c,
                LLC_BI__Advance_Rate_Override__c = p.LLC_BI__Advance_Rate_Override__c,
                LLC_BI__Override_Reason__c = p.LLC_BI__Override_Reason__c,
                LLC_BI__Start_Date__c = p.LLC_BI__Start_Date__c,
                LLC_BI__End_Date__c = p.LLC_BI__End_Date__c,
                LLC_BI__Is_Excluded__c = p.LLC_BI__Is_Excluded__c,
                LLC_BI__Is_Leased_Asset__c = p.LLC_BI__Is_Leased_Asset__c,
                LLC_BI__Abundance_of_Caution__c = p.LLC_BI__Abundance_of_Caution__c
            ));
        }
        if (!pledgeCopies.isEmpty()) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_PLEDGE, C360WriteGuard.OP_CARRY,
                new Map<String, Object>{
                    'LLC_BI__Loan__c' => null, 'LLC_BI__Collateral__c' => null,
                    'LLC_BI__Loan_Collateral_Aggregate__c' => null, 'LLC_BI__Lien_Position__c' => null,
                    'LLC_BI__Pledged_Status__c' => null, 'LLC_BI__Active__c' => null,
                    'LLC_BI__Is_Primary__c' => null, 'LLC_BI__Amount_Pledged__c' => null,
                    'LLC_BI__Advance_Rate_Override__c' => null, 'LLC_BI__Override_Reason__c' => null,
                    'LLC_BI__Start_Date__c' => null, 'LLC_BI__End_Date__c' => null,
                    'LLC_BI__Is_Excluded__c' => null, 'LLC_BI__Is_Leased_Asset__c' => null,
                    'LLC_BI__Abundance_of_Caution__c' => null
                });
            insert as user pledgeCopies;
        }

        List<LLC_BI__Legal_Entities__c> invCopies = new List<LLC_BI__Legal_Entities__c>();
        for (LLC_BI__Legal_Entities__c e : [
            SELECT LLC_BI__Loan__c, LLC_BI__Account__c, LLC_BI__Borrower_Type__c, LLC_BI__Ownership__c,
                   LLC_BI__Relationship_Type__c, LLC_BI__Entity_Type__c, LLC_BI__Order__c,
                   LLC_BI__Contingent_Type__c, LLC_BI__Guarantee_Effective_Date__c,
                   LLC_BI__Guarantee_End_Date__c, LLC_BI__Guarantee_Limit__c, LLC_BI__Guaranty_Amount__c
            FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN :parents WITH USER_MODE
        ]) {
            Id cloneId = cloneByParent.get(e.LLC_BI__Loan__c);
            if (cloneId == null) {
                continue;
            }
            invCopies.add(new LLC_BI__Legal_Entities__c(
                LLC_BI__Loan__c = cloneId,
                LLC_BI__Product_Package__c = newPkgId,
                LLC_BI__Account__c = e.LLC_BI__Account__c,
                LLC_BI__Borrower_Type__c = e.LLC_BI__Borrower_Type__c,
                LLC_BI__Ownership__c = e.LLC_BI__Ownership__c,
                LLC_BI__Relationship_Type__c = e.LLC_BI__Relationship_Type__c,
                LLC_BI__Entity_Type__c = e.LLC_BI__Entity_Type__c,
                LLC_BI__Order__c = e.LLC_BI__Order__c,
                LLC_BI__Contingent_Type__c = e.LLC_BI__Contingent_Type__c,
                LLC_BI__Guarantee_Effective_Date__c = e.LLC_BI__Guarantee_Effective_Date__c,
                LLC_BI__Guarantee_End_Date__c = e.LLC_BI__Guarantee_End_Date__c,
                LLC_BI__Guarantee_Limit__c = e.LLC_BI__Guarantee_Limit__c,
                LLC_BI__Guaranty_Amount__c = e.LLC_BI__Guaranty_Amount__c
            ));
        }
        if (!invCopies.isEmpty()) {
            C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_INVOLVEMENT, C360WriteGuard.OP_CARRY,
                new Map<String, Object>{
                    'LLC_BI__Loan__c' => null, 'LLC_BI__Product_Package__c' => null,
                    'LLC_BI__Account__c' => null, 'LLC_BI__Borrower_Type__c' => null,
                    'LLC_BI__Ownership__c' => null, 'LLC_BI__Relationship_Type__c' => null,
                    'LLC_BI__Entity_Type__c' => null, 'LLC_BI__Order__c' => null,
                    'LLC_BI__Contingent_Type__c' => null, 'LLC_BI__Guarantee_Effective_Date__c' => null,
                    'LLC_BI__Guarantee_End_Date__c' => null, 'LLC_BI__Guarantee_Limit__c' => null,
                    'LLC_BI__Guaranty_Amount__c' => null
                });
            insert as user invCopies;
        }

        // The proof is the re-read, never the insert result.
        Set<Id> cloneIds = new Set<Id>(cloneByParent.values());
        Integer covBack = [SELECT COUNT() FROM LLC_BI__Loan_Covenant__c WHERE LLC_BI__Loan__c IN :cloneIds WITH USER_MODE];
        Integer plBack = [SELECT COUNT() FROM LLC_BI__Loan_Collateral2__c WHERE LLC_BI__Loan__c IN :cloneIds WITH USER_MODE];
        Integer invBack = [SELECT COUNT() FROM LLC_BI__Legal_Entities__c WHERE LLC_BI__Loan__c IN :cloneIds WITH USER_MODE];
        Boolean ok = covBack == covCopies.size() && plBack == pledgeCopies.size() && invBack == invCopies.size();
        String detail = 'The junction graph was carried onto the new version and re-read: ' +
            covBack + ' of ' + covCopies.size() + ' covenant junctions, ' +
            plBack + ' of ' + pledgeCopies.size() + ' collateral pledges (on ' + aggByClone.size() + ' fresh aggregates), ' +
            invBack + ' of ' + invCopies.size() + ' borrowing involvements.';
        return (ok ? 'CARRIED ' : '') + detail;
    }

    // -------------------------------------------------------------------------------------------
    // Reads and small helpers.
    // -------------------------------------------------------------------------------------------

    private static cm_Action_Staging__c readStaging(String stagingId) {
        List<cm_Action_Staging__c> rows = [
            SELECT Id, cm_Action_Id__c
            FROM cm_Action_Staging__c
            WHERE Id = :stagingId
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    /** The selection read, in the shape C360Facilities.validate expects. */
    private static List<LLC_BI__Loan__c> readFacilities(List<Id> facilityIds) {
        return [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__lookupKey__c,
                   LLC_BI__Account__c, LLC_BI__Product_Package__c, LLC_BI__Amount__c,
                   LLC_BI__Maturity_Date__c, LLC_BI__Is_Modification__c, LLC_BI__isRenewal__c
            FROM LLC_BI__Loan__c
            WHERE Id IN :facilityIds
            WITH USER_MODE
        ];
    }

    private static List<LLC_BI__Loan__c> readLoans(Set<Id> loanIds) {
        return [
            SELECT Id, Name, LLC_BI__Stage__c, LLC_BI__Status__c, LLC_BI__lookupKey__c,
                   LLC_BI__Amount__c, LLC_BI__Maturity_Date__c, LLC_BI__InterestRate__c,
                   LLC_BI__Term_Months__c, LLC_BI__Is_Modification__c, LLC_BI__Product_Package__c
            FROM LLC_BI__Loan__c
            WHERE Id IN :loanIds
            WITH USER_MODE
        ];
    }

    /** The org-assigned name of an already-created facility, so a replay stamps the same label. */
    private static String nameOf(String recordId) {
        if (String.isBlank(recordId)) {
            return null;
        }
        List<LLC_BI__Loan__c> rows = [SELECT Id, Name FROM LLC_BI__Loan__c WHERE Id = :recordId WITH USER_MODE LIMIT 1];
        return rows.isEmpty() ? null : rows[0].Name;
    }

    private static Decimal revision(LLC_BI__LoanRenewal__c j) {
        return j.LLC_BI__RevisionNumber__c == null ? -1 : j.LLC_BI__RevisionNumber__c;
    }

    /** The parent is compared on the three fields a modification must never move. */
    private static Boolean parentUnchanged(LLC_BI__Loan__c before, LLC_BI__Loan__c after) {
        if (after == null) {
            return false;
        }
        return before.LLC_BI__Stage__c == after.LLC_BI__Stage__c
            && before.LLC_BI__Status__c == after.LLC_BI__Status__c
            && before.LLC_BI__Amount__c == after.LLC_BI__Amount__c;
    }

    /** Reports each requested change as it reads back off the clone, naming any that did not land. */
    private static String applied(
        LLC_BI__Loan__c clone,
        Decimal amount,
        Date maturity,
        Decimal rate,
        Decimal term
    ) {
        List<String> parts = new List<String>();
        if (amount != null) {
            parts.add(amount == clone.LLC_BI__Amount__c
                ? 'Amount reads back at ' + String.valueOf(clone.LLC_BI__Amount__c)
                : 'Amount did not land: requested ' + String.valueOf(amount) + ', reads back ' + String.valueOf(clone.LLC_BI__Amount__c));
        }
        if (maturity != null) {
            parts.add(maturity == clone.LLC_BI__Maturity_Date__c
                ? 'Maturity date reads back at ' + String.valueOf(clone.LLC_BI__Maturity_Date__c)
                : 'Maturity date did not land: requested ' + String.valueOf(maturity) + ', reads back ' + String.valueOf(clone.LLC_BI__Maturity_Date__c));
        }
        if (rate != null) {
            parts.add(rate == clone.LLC_BI__InterestRate__c
                ? 'Interest rate reads back at ' + String.valueOf(clone.LLC_BI__InterestRate__c)
                : 'Interest rate did not land: requested ' + String.valueOf(rate) + ', reads back ' + String.valueOf(clone.LLC_BI__InterestRate__c));
        }
        if (term != null) {
            parts.add(term == clone.LLC_BI__Term_Months__c
                ? 'Term reads back at ' + String.valueOf(clone.LLC_BI__Term_Months__c) + ' months'
                : 'Term did not land: requested ' + String.valueOf(term) + ', reads back ' + String.valueOf(clone.LLC_BI__Term_Months__c));
        }
        return parts.isEmpty() ? 'No field changes were staged.' : String.join(parts, '. ') + '.';
    }

    private static List<StepResult> toWireSteps(List<C360Plan.Step> steps) {
        List<StepResult> out = new List<StepResult>();
        for (C360Plan.Step s : steps) {
            StepResult r = new StepResult();
            r.id = s.id;
            r.type = s.type;
            r.label = s.label;
            r.state = s.state;
            r.detail = s.detail;
            out.add(r);
        }
        return out;
    }

    private static ToolError err(String code, String message, String orgError, String step, Boolean resumable, String idempotencyKey) {
        ToolError e = new ToolError();
        e.code = code;
        e.message = message;
        e.orgError = orgError;
        e.step = step;
        e.resumable = resumable;
        e.idempotencyKey = idempotencyKey;
        return e;
    }
}
