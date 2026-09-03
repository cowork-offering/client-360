/**
 * CompleteNewFacilityDetail - MCP tool: complete_new_facility_detail.
 *
 * THE SECOND HOP FOR A NET-NEW FACILITY'S PURPOSE (founder, 2026-09-03).
 *
 * THE OBJECT AND THE FIELD, confirmed by describing the org on 2026-09-03:
 *
 *     LLC_BI__Loan_Detail__c.LLC_BI__Primary_Loan_Purpose__c
 *
 * `LLC_BI__Loan__c` carries NO primary-purpose field. The only purpose field on
 * the loan is `cm_Purpose_of_Loan__c`, which is org-local and is not what nCino
 * reads. The field is a RESTRICTED picklist with 23 active coded values, so the
 * org refuses anything outside its own list rather than storing it; the value is
 * therefore validated at STAGE time by C360NewFacilities and re-checked here.
 *
 * WHY A SECOND HOP AT ALL, and why not just wait. nCino creates the Loan Detail
 * from an AFTER-COMMIT flow in a transaction of its own, about four seconds later
 * (PROBE-LEDGER wave 3, probe 5). It is structurally invisible to the transaction
 * that inserted the facility, and wave 4 proved a spin-wait burns the synchronous
 * CPU ceiling and can never see it. So execute_loan_modification files the
 * facility and reports the purpose as PENDING, and this tool finishes it.
 *
 * IT IS ITS OWN HOP, NOT A TAIL ON THE ARM. The 2026-08-31 governor fix exists to
 * keep writes out of the engine leg, and the arm hop is already at about 52 of
 * nCino's own 100-query budget. A third write pass bolted onto either would put
 * the same transaction back under the pressure that fix removed. This runs when
 * the caller calls it, which is after the org has had its own transaction.
 *
 * IT TAKES NOTHING BUT THE PLAN. Everything about WHERE to write it re-derives
 * from the org: the staging record names the clone, the clone names the new
 * package version, and the facilities on that version with NO chain row pointing
 * at them are the net-new ones. A caller cannot hand it a facility the plan never
 * created, because a caller hands it nothing at all.
 *
 * IDEMPOTENT, AND ZERO WRITES WHEN THERE IS NOTHING TO WRITE. A purpose that
 * already reads back correct is not re-written, a Loan Detail that has not
 * appeared is reported rather than waited for, and a plan carrying no net-new
 * facility returns `nothing_to_do` having performed no DML at all. Running it
 * twice is safe by construction rather than by a fence.
 */
global with sharing class CompleteNewFacilityDetail {

    /** Raised for a domain-level failure. Surfaces as ok:false, never as a fault. */
    public class ToolException extends Exception {}

    private static final String ACTION_ID = 'loan-modification';

    /** Every outcome this tool reports, so a caller can branch without parsing prose. */
    global class Request {
        @InvocableVariable(label='Staging Id' description='The staging record of the modification that filed the facilities. The plan is the only input: everything else is re-derived from the org.' required=true)
        global String stagingId;
        @InvocableVariable(label='Approver User Id' description='Required on every write in this package without exception. Must match the identity that confirmed the plan.' required=true)
        global String approverUserId;
    }

    /** One net-new facility and what this run did about its purpose. */
    global class DetailResult {
        @InvocableVariable(label='Label' description='The label the plan named it by before it had an id: new:1, new:2.')
        global String label;
        @InvocableVariable(label='Loan Id')
        global String loanId;
        @InvocableVariable(label='Record Name' description='The name the ORG assigned the facility.')
        global String recordName;
        @InvocableVariable(label='Loan Detail Id' description='Null while nCino has not created the child yet.')
        global String loanDetailId;
        @InvocableVariable(label='Primary Loan Purpose' description='The value the plan carries for this facility.')
        global String purpose;
        @InvocableVariable(label='State' description='written, already_set, pending_detail or not_found.')
        global String state;
        @InvocableVariable(label='Verification' description='What was read back, in the banker\'s own terms.')
        global String verification;
    }

    global class ToolError {
        @InvocableVariable(label='Code')
        global String code;
        @InvocableVariable(label='Message')
        global String message;
        @InvocableVariable(label='Org Error')
        global String orgError;
        @InvocableVariable(label='Resumable' description='True where the Loan Detail simply has not appeared yet, which is not a failure.')
        global Boolean resumable;
    }

    global class CompleteResult {
        @InvocableVariable(label='Staging Id')
        global String stagingId;
        @InvocableVariable(label='Product Package Id' description='The new package version the facilities were filed on.')
        global String productPackageId;
        @InvocableVariable(label='Facilities')
        global List<DetailResult> facilities;
        @InvocableVariable(label='Written Count' description='How many purposes this run actually wrote. Zero is the ordinary answer on a replay.')
        global Integer writtenCount;
        @InvocableVariable(label='Pending Count' description='How many are still waiting on nCino to create the Loan Detail.')
        global Integer pendingCount;
        @InvocableVariable(label='Resumable' description='True while any facility is still waiting on its Loan Detail. Call again in a moment.')
        global Boolean resumable;
        @InvocableVariable(label='Outcome')
        global String outcome;
    }

    global class Response {
        @InvocableVariable(label='OK')
        global Boolean ok;
        @InvocableVariable(label='Result')
        global CompleteResult result;
        @InvocableVariable(label='Error')
        global ToolError error;
    }

    /**
     * Finishes the purpose on every net-new facility an executed modification filed.
     *
     * @param requests One request per executed plan. Element i of the response belongs to input i.
     * @return One response per request.
     */
    @InvocableMethod(
        label='complete_new_facility_detail'
        description='Finish a net-new facility filed by execute_loan_modification: write the staged primary loan purpose onto the LLC_BI__Loan_Detail__c record nCino creates for it after the filing transaction commits. Takes the staging id and nothing else, re-deriving every target from the org. Idempotent and writes NOTHING when the purposes already read back correct, when the Loan Detail has not appeared yet, or when the plan carried no net-new facility.'
    )
    global static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();
            try {
                res.result = complete(req);
                res.ok = true;
            } catch (ToolException e) {
                res.ok = false;
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, false);
            } catch (C360NewFacilities.NewFacilityException e) {
                res.ok = false;
                res.error = err('VALIDATION_FAILED', e.getMessage(), null, false);
            } catch (C360WriteGuard.GuardException e) {
                res.ok = false;
                res.error = err('ALLOWLIST_REFUSED', e.getMessage(), null, false);
            } catch (DmlException e) {
                res.ok = false;
                res.error = err('ORG_REJECTED_WRITE', 'The org refused the purpose write.', e.getMessage(), true);
            } catch (QueryException e) {
                res.ok = false;
                res.error = err('READ_FAILED', 'A record this run depends on could not be read.', e.getMessage(), true);
            }
            out.add(res);
        }
        return out;
    }

    private static CompleteResult complete(Request req) {
        if (String.isBlank(req.stagingId)) {
            throw new ToolException('stagingId is required. The executed plan is the only input this tool takes.');
        }
        Id approver = C360Plan.asId(req.approverUserId);
        if (approver == null) {
            throw new ToolException('approverUserId is required on every write in this package without exception.');
        }
        if (approver != UserInfo.getUserId()) {
            throw new ToolException('approverUserId does not match the running identity. This server runs as-user.');
        }

        cm_Action_Staging__c stg = readStaging(req.stagingId);
        if (stg == null) {
            throw new ToolException('No staging record found for stagingId ' + req.stagingId + '.');
        }
        if (stg.cm_Action_Id__c != ACTION_ID) {
            throw new ToolException(
                'Staging record ' + req.stagingId + ' holds a ' + stg.cm_Action_Id__c + ' plan, not a loan modification. ' +
                'This tool finishes what execute_loan_modification filed, or nothing.'
            );
        }
        if (stg.cm_Approver_User__c != null && stg.cm_Approver_User__c != approver) {
            throw new ToolException(
                'This action was confirmed by a different person. Finishing it is the same plan continuing for the same ' +
                'human, and is not a way to hand an authorized plan to someone else.'
            );
        }
        if (String.isBlank(stg.cm_Result_Record_Id__c)) {
            throw new ToolException(
                'This plan has not produced a facility yet, so there is nothing to finish. Execute it first.'
            );
        }

        Map<String, Object> v = C360Plan.deserializeValues(stg.cm_Plan_JSON__c);
        Decimal countRaw = C360Plan.asDecimal(v.get('newFacilityCount'));
        Integer count = countRaw == null ? 0 : Integer.valueOf(countRaw);

        CompleteResult out = new CompleteResult();
        out.stagingId = stg.Id;
        out.facilities = new List<DetailResult>();
        out.writtenCount = 0;
        out.pendingCount = 0;
        out.resumable = false;

        // ZERO WRITES AND ZERO READS BEYOND THE PLAN where the plan filed no
        // facility. Almost every modification is this one, and it must cost the
        // caller nothing at all to ask.
        if (count == 0) {
            out.outcome = 'This plan filed no net-new facility, so there is no Loan Detail to finish. Nothing was read and nothing was written.';
            return out;
        }

        Id newPkgId = packageOf(C360Plan.asId(stg.cm_Result_Record_Id__c));
        if (newPkgId == null) {
            throw new ToolException(
                'The facility this plan created could not be re-read, so the package version it sits on is unknown. ' +
                'Nothing was written.'
            );
        }
        out.productPackageId = newPkgId;

        // THE NET-NEW FACILITIES, RE-DERIVED. Every loan on the new version is
        // either a CLONE, which carries a chain row pointing at it, or one this
        // plan authored, which carries none. That is the org's own distinction
        // and it is why this tool needs nothing from the caller.
        List<LLC_BI__Loan__c> onVersion = [
            SELECT Id, Name, LLC_BI__Product__c, LLC_BI__Amount__c, LLC_BI__Loan_Detail__c
            FROM LLC_BI__Loan__c
            WHERE LLC_BI__Product_Package__c = :newPkgId
            WITH USER_MODE
        ];
        Set<Id> cloned = new Set<Id>();
        for (LLC_BI__LoanRenewal__c j : [
            SELECT LLC_BI__RenewalLoanId__c FROM LLC_BI__LoanRenewal__c
            WHERE LLC_BI__RenewalLoanId__c IN :onVersion
            WITH USER_MODE
        ]) {
            cloned.add(j.LLC_BI__RenewalLoanId__c);
        }
        List<LLC_BI__Loan__c> authored = new List<LLC_BI__Loan__c>();
        for (LLC_BI__Loan__c l : onVersion) {
            if (!cloned.contains(l.Id)) {
                authored.add(l);
            }
        }

        // Match each staged facility to the loan it became, by the two things the
        // plan pinned and the org kept: the product and the commitment. A match
        // that is not unique is left alone rather than guessed at.
        Set<Id> taken = new Set<Id>();
        List<LLC_BI__Loan_Detail__c> toWrite = new List<LLC_BI__Loan_Detail__c>();
        List<Integer> rowOf = new List<Integer>();

        for (Integer i = 0; i < count; i++) {
            C360NewFacilities.NewFacility nf = C360NewFacilities.fromResolved(v, i);
            DetailResult r = new DetailResult();
            r.label = nf.label;
            r.purpose = nf.purpose;
            out.facilities.add(r);

            List<LLC_BI__Loan__c> hits = new List<LLC_BI__Loan__c>();
            for (LLC_BI__Loan__c l : authored) {
                if (taken.contains(l.Id)) {
                    continue;
                }
                if (l.LLC_BI__Product__c == nf.product && l.LLC_BI__Amount__c == nf.amount) {
                    hits.add(l);
                }
            }
            if (hits.size() != 1) {
                r.state = 'not_found';
                r.verification = hits.isEmpty()
                    ? 'No facility on the new package version matches ' + C360NewFacilities.phrase(nf) +
                      ', so nothing is claimed for it and nothing was written.'
                    : String.valueOf(hits.size()) + ' facilities on the new package version match ' +
                      C360NewFacilities.phrase(nf) + '. This tool will not choose between them.';
                continue;
            }
            LLC_BI__Loan__c loan = hits[0];
            taken.add(loan.Id);
            r.loanId = loan.Id;
            r.recordName = loan.Name;

            if (loan.LLC_BI__Loan_Detail__c == null) {
                r.state = 'pending_detail';
                r.verification =
                    'nCino has not created the Loan Detail for ' + loan.Name + ' yet. That is not a failure: the org ' +
                    'creates it asynchronously, and calling again once it is there finishes the purpose.';
                out.pendingCount += 1;
                out.resumable = true;
                continue;
            }
            r.loanDetailId = loan.LLC_BI__Loan_Detail__c;
            // The value is re-checked against the org's own live picklist, not
            // trusted from the plan: the plan was hashed before this org's
            // configuration was last read, and a restricted picklist refuses.
            C360NewFacilities.assertPurpose(nf.purpose, r.label);
            toWrite.add(new LLC_BI__Loan_Detail__c(Id = loan.LLC_BI__Loan_Detail__c));
            rowOf.add(out.facilities.size() - 1);
        }

        // IDEMPOTENCE IS A READ, NOT A FENCE. A purpose that already reads back
        // correct is not re-written, so a second call performs no DML at all and
        // reports the same answer as the first.
        if (!toWrite.isEmpty()) {
            Set<Id> detailIds = new Map<Id, LLC_BI__Loan_Detail__c>(toWrite).keySet();
            Map<Id, LLC_BI__Loan_Detail__c> before = new Map<Id, LLC_BI__Loan_Detail__c>([
                SELECT Id, LLC_BI__Primary_Loan_Purpose__c FROM LLC_BI__Loan_Detail__c
                WHERE Id IN :detailIds WITH USER_MODE
            ]);
            List<LLC_BI__Loan_Detail__c> dirty = new List<LLC_BI__Loan_Detail__c>();
            List<Integer> dirtyRow = new List<Integer>();
            for (Integer k = 0; k < toWrite.size(); k++) {
                DetailResult r = out.facilities[rowOf[k]];
                LLC_BI__Loan_Detail__c held = before.get(toWrite[k].Id);
                if (held != null && held.LLC_BI__Primary_Loan_Purpose__c == r.purpose) {
                    r.state = 'already_set';
                    r.verification = 'The Loan Detail already reads ' + r.purpose + '. Nothing was written.';
                    continue;
                }
                Map<String, Object> fields = new Map<String, Object>{
                    C360NewFacilities.FLD_PRIMARY_PURPOSE => r.purpose
                };
                C360WriteGuard.assertAllowed(C360WriteGuard.OBJ_LOAN_DETAIL, C360WriteGuard.OP_UPDATE, fields);
                dirty.add(new LLC_BI__Loan_Detail__c(
                    Id = toWrite[k].Id,
                    LLC_BI__Primary_Loan_Purpose__c = r.purpose
                ));
                dirtyRow.add(rowOf[k]);
            }

            if (!dirty.isEmpty()) {
                update as user dirty;
                Set<Id> wroteIds = new Map<Id, LLC_BI__Loan_Detail__c>(dirty).keySet();
                Map<Id, LLC_BI__Loan_Detail__c> after = new Map<Id, LLC_BI__Loan_Detail__c>([
                    SELECT Id, LLC_BI__Primary_Loan_Purpose__c FROM LLC_BI__Loan_Detail__c
                    WHERE Id IN :wroteIds WITH USER_MODE
                ]);
                for (Integer k = 0; k < dirty.size(); k++) {
                    DetailResult r = out.facilities[dirtyRow[k]];
                    LLC_BI__Loan_Detail__c back = after.get(dirty[k].Id);
                    Boolean landed = back != null && back.LLC_BI__Primary_Loan_Purpose__c == r.purpose;
                    r.state = landed ? 'written' : 'not_found';
                    r.verification = landed
                        ? 'The primary loan purpose on ' + r.recordName + ' reads back ' + r.purpose + '.'
                        : 'The update returned success but the Loan Detail reads back ' +
                          (back == null ? 'nothing at all' : String.valueOf(back.LLC_BI__Primary_Loan_Purpose__c)) + '.';
                    if (landed) {
                        out.writtenCount += 1;
                    }
                }
            }
        }

        out.outcome = summarise(out);
        return out;
    }

    /** What the banker reads, counting what happened rather than what was planned. */
    private static String summarise(CompleteResult out) {
        Integer already = 0;
        Integer missing = 0;
        for (DetailResult r : out.facilities) {
            if (r.state == 'already_set') {
                already += 1;
            } else if (r.state == 'not_found') {
                missing += 1;
            }
        }
        List<String> said = new List<String>();
        if (out.writtenCount > 0) {
            said.add(
                'Purpose written on ' + out.writtenCount +
                (out.writtenCount == 1 ? ' new facility' : ' new facilities')
            );
        }
        if (already > 0) {
            said.add(already + (already == 1 ? ' already carried it' : ' already carried theirs') + ', so nothing was written for ' + (already == 1 ? 'it' : 'them'));
        }
        if (out.pendingCount > 0) {
            said.add(
                'Purpose pending on ' + out.pendingCount + ': nCino has not created the Loan Detail yet, which is not a failure'
            );
        }
        if (missing > 0) {
            said.add(missing + (missing == 1 ? ' facility could not be matched on the new version' : ' facilities could not be matched on the new version'));
        }
        if (said.isEmpty()) {
            return 'There was nothing to write.';
        }
        return String.join(said, '. ') + '.';
    }

    /** The package the facility this plan produced sits on, which is the new version. */
    private static Id packageOf(Id loanId) {
        if (loanId == null) {
            return null;
        }
        List<LLC_BI__Loan__c> rows = [
            SELECT Id, LLC_BI__Product_Package__c FROM LLC_BI__Loan__c WHERE Id = :loanId WITH USER_MODE LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0].LLC_BI__Product_Package__c;
    }

    private static cm_Action_Staging__c readStaging(String stagingId) {
        List<cm_Action_Staging__c> rows = [
            SELECT Id, cm_Action_Id__c, cm_Plan_JSON__c, cm_Status__c, cm_Result_Record_Id__c, cm_Approver_User__c
            FROM cm_Action_Staging__c
            WHERE Id = :stagingId
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    private static ToolError err(String code, String message, String orgError, Boolean resumable) {
        ToolError e = new ToolError();
        e.code = code;
        e.message = message;
        e.orgError = orgError;
        e.resumable = resumable;
        return e;
    }
}
