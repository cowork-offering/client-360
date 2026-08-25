# KYC gateway read observations (2026-08-25, archived for the stretch build)
- db_query with an sql field works; customer table has demo personas 9000000001-8
  (DemoLow, DemoHighRisk, DemoPep, DemoSanctions, DemoCorp, DemoHappy).
- get_customer(customer_id) returns status, customer_id, and a data object: identity, dob,
  account_no, address object, pep flag, masked ssn, accounts list (account_number, product_type,
  product_status, card_number_last4, loan_id).
- get_customer360: REQUIRES account_numbers in the body (the tool schema does not declare it),
  passed as a COMMA-SEPARATED STRING, never a JSON array (an array-shaped string gets split on
  commas and refused). Response is a large profile with 8 sections; full sample saved in the
  session tool-results directory.
- Stage/approve address round-trip NOT yet observed (stopped on the Aug 25 KYC downgrade).
