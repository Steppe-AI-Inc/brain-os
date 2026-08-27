SCENARIO ID: SC-079-messenger-sales-lead

PURPOSE: A Facebook Messenger inquiry that becomes a sales lead must be captured against the
correct company and follow the same sales-lead authorization as any other lead.

ACTOR: EXTERNAL_CUSTOMER + SALES_EMPLOYEE.
ORGANIZATION: the owning company.
ROLE: employee.
CAPABILITIES: sales_leads_insert_member (any member creates), update own/manager.

PRECONDITIONS: (future) a Messenger inbound bound to a company.

ACTION: the inbound is converted to a sales_leads row.

EXPECTED RESULT (intended): the lead is created with the correct company_id (validated
server-side, never trusting a client-supplied org id, SC-071); visibility follows
sales_leads_select_scope (owner/manager/founder); another company sees 0 (SC-056).

EXPECTED DENIALS: wrong-company lead creation (SC-071); cross-company lead visibility.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — messaging inbound not implemented. The sales_leads RLS it
would target IS real (governance/capabilities/CAPABILITY_MATRIX.yaml sales.*). Cross-ref
SC-071, SC-056, SC-109.

LAST VERIFIED DATE: n/a (feature not built)
