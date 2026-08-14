/**
 * Customer360RelationshipGraph — MCP tool: ownership + beneficial-ownership graph.
 *
 * MERGED tool (architecture review): household/ownership structure and
 * beneficial-ownership (KYC) are the SAME underlying data — the Connection
 * graph and Legal Entities involvement — so one tool serves both questions
 * instead of two tools redundantly querying the same 208-edge graph.
 *
 * Primary source: LLC_BI__Connection__c (the populated ownership/relationship
 * graph, 208 edges org-wide; FinServ__AccountAccountRelation__c is sparse,
 * 8 edges, and is NOT queried here — it is FSC enrichment, out of scope for
 * this tool per the verified data model).
 * Secondary source: LLC_BI__Legal_Entities__c (per-facility involvement:
 * borrower vs guarantor vs co-borrower, with guaranty amounts).
 *
 * KYC__c and Compliance_Check__c are NOT queried — confirmed near-empty
 * org-wide (0-1 rows). The real, populated beneficial-ownership signal for
 * this org is the Connection graph + Legal Entities, surfaced here.
 *
 * All fields verified live against the bankinggpt sandbox (sobject-sf MCP,
 * 2026-07-01).
 */
global with sharing class Customer360RelationshipGraph {

    global class Request {
        @InvocableVariable(label='Account Id' description='Salesforce Account Id of the customer/relationship anchor.' required=true)
        global String accountId;
    }

    global class ConnectionEdge {
        @InvocableVariable(label='Counterparty Account Id')
        global String counterpartyId;
        @InvocableVariable(label='Counterparty Name')
        global String counterpartyName;
        @InvocableVariable(label='Direction' description='outbound = this account connects TO the counterparty; inbound = counterparty connects TO this account.')
        global String direction;
        @InvocableVariable(label='Role')
        global String role;
        @InvocableVariable(label='Ownership Percent')
        global Decimal ownershipPercent;
        @InvocableVariable(label='Indirect Ownership Percent')
        global Decimal indirectOwnershipPercent;
        @InvocableVariable(label='Total Direct + Indirect Ownership Percent')
        global Decimal totalOwnershipPercent;
        @InvocableVariable(label='Active')
        global Boolean isActive;
    }

    global class LegalEntityInvolvement {
        @InvocableVariable(label='Entity Account Name')
        global String accountName;
        @InvocableVariable(label='Borrower Type' description='Borrower, Guarantor, Limited Guarantor, Co-Borrower, Related Entity, Grantor, Contractor.')
        global String borrowerType;
        @InvocableVariable(label='Relationship/Ownership Type')
        global String relationshipType;
        @InvocableVariable(label='Ownership Percent')
        global Decimal ownershipPercent;
        @InvocableVariable(label='Guaranty Amount Type')
        global String guarantyAmountType;
        @InvocableVariable(label='Contingent Amount')
        global Decimal contingentAmount;
        @InvocableVariable(label='Linked Loan Id')
        global String loanId;
        @InvocableVariable(label='Linked Product Package Id')
        global String packageId;
    }

    global class Response {
        @InvocableVariable(label='Account Id')
        global String accountId;
        @InvocableVariable(label='Connection Graph Edges')
        global List<ConnectionEdge> connections;
        @InvocableVariable(label='Legal Entity Involvements (borrower/guarantor roles)')
        global List<LegalEntityInvolvement> legalEntities;
        @InvocableVariable(label='Note')
        global String note;
    }

    @InvocableMethod(
        label='Customer 360: Relationship Graph'
        description='Ownership and beneficial-ownership structure: the Connection graph (who owns/is owned, ownership percent, role) and Legal Entity involvement (who is Borrower vs Guarantor vs Co-Borrower on the deals, with guaranty amounts). Serves both the household/ownership question and the KYC beneficial-ownership question — they read the same data.'
    )
    global static List<Response> getRelationshipGraph(List<Request> requests) {
        List<Response> results = new List<Response>();

        for (Request req : requests) {
            Response res = new Response();
            res.accountId = req.accountId;
            res.connections = new List<ConnectionEdge>();
            res.legalEntities = new List<LegalEntityInvolvement>();

            List<LLC_BI__Connection__c> conns = [
                SELECT Id, LLC_BI__Connected_From__c, LLC_BI__Connected_From__r.Name,
                       LLC_BI__Connected_To__c, LLC_BI__Connected_To__r.Name,
                       LLC_BI__Connection_Role__r.Name,
                       LLC_BI__Ownership_Percent__c, LLC_BI__Indirect_Ownership_Percent__c,
                       LLC_BI__Total_Direct_Indirect_Ownership_Percent__c, LLC_BI__Is_Active__c
                FROM LLC_BI__Connection__c
                WHERE (LLC_BI__Connected_From__c = :req.accountId OR LLC_BI__Connected_To__c = :req.accountId)
                  AND LLC_BI__Is_Active__c = true
                WITH USER_MODE
            ];

            for (LLC_BI__Connection__c c : conns) {
                ConnectionEdge edge = new ConnectionEdge();
                Boolean outbound = (c.LLC_BI__Connected_From__c == req.accountId);
                edge.direction = outbound ? 'outbound' : 'inbound';
                edge.counterpartyId = outbound ? c.LLC_BI__Connected_To__c : c.LLC_BI__Connected_From__c;
                edge.counterpartyName = outbound
                    ? (c.LLC_BI__Connected_To__r != null ? c.LLC_BI__Connected_To__r.Name : null)
                    : (c.LLC_BI__Connected_From__r != null ? c.LLC_BI__Connected_From__r.Name : null);
                edge.role = c.LLC_BI__Connection_Role__r != null ? c.LLC_BI__Connection_Role__r.Name : null;
                edge.ownershipPercent = c.LLC_BI__Ownership_Percent__c;
                edge.indirectOwnershipPercent = c.LLC_BI__Indirect_Ownership_Percent__c;
                edge.totalOwnershipPercent = c.LLC_BI__Total_Direct_Indirect_Ownership_Percent__c;
                edge.isActive = c.LLC_BI__Is_Active__c;
                res.connections.add(edge);
            }

            List<LLC_BI__Legal_Entities__c> entities = [
                SELECT Id, LLC_BI__Account__r.Name, LLC_BI__Borrower_Type__c,
                       LLC_BI__Relationship_Type__c, LLC_BI__Ownership__c,
                       LLC_BI__Guaranty_Amount__c, LLC_BI__Contingent_Amount__c,
                       LLC_BI__Loan__c, LLC_BI__Product_Package__c
                FROM LLC_BI__Legal_Entities__c
                WHERE LLC_BI__Account__c = :req.accountId
                WITH USER_MODE
                ORDER BY LLC_BI__Order__c ASC NULLS LAST
            ];

            for (LLC_BI__Legal_Entities__c e : entities) {
                LegalEntityInvolvement li = new LegalEntityInvolvement();
                li.accountName = e.LLC_BI__Account__r != null ? e.LLC_BI__Account__r.Name : null;
                li.borrowerType = e.LLC_BI__Borrower_Type__c;
                li.relationshipType = e.LLC_BI__Relationship_Type__c;
                li.ownershipPercent = e.LLC_BI__Ownership__c;
                li.guarantyAmountType = e.LLC_BI__Guaranty_Amount__c;
                li.contingentAmount = e.LLC_BI__Contingent_Amount__c;
                li.loanId = e.LLC_BI__Loan__c;
                li.packageId = e.LLC_BI__Product_Package__c;
                res.legalEntities.add(li);
            }

            res.note = (res.connections.isEmpty() && res.legalEntities.isEmpty())
                ? 'No ownership or legal-entity involvement records found for this account.'
                : 'Beneficial ownership = Connection edges with Ownership Percent. Borrower/Guarantor roles = legalEntities. Formal KYC/CDD/OFAC screening records are not modeled separately in this org — treat as not-on-file unless a dedicated screening source is wired up.';

            results.add(res);
        }

        return results;
    }
}
