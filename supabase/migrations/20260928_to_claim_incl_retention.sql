-- to_claim = billable contract − (claimed net + retention held), i.e. the client master's
-- "Value of Balance Work" (E25077: 111,696 − 16,093.80 − 1,788.20 = 93,814.00).
-- Before this it subtracted only Σ amount (net of retention), overstating what is left to claim.
create or replace view public.project_claim_summary as
select p.id as project_id,
    p.project_code,
    p.name as project_name,
    p.client_name,
    p.sales_manager,
    p.status as project_status,
    p.billing_status,
    p.follow_up_owner,
    p.work_type_code,
    p.contract_value,
    p.vo_value,
    coalesce(nullif(p.total_contract_value, 0::numeric), p.contract_value) as billable_contract,
    count(c.id) as claim_count,
    round(coalesce(sum(c.amount), 0::numeric), 2) as total_claimed,
    round(coalesce(sum(c.certified_amount), 0::numeric), 2) as total_certified,
    case
        when coalesce(nullif(p.total_contract_value, 0::numeric), p.contract_value) is null
          or coalesce(nullif(p.total_contract_value, 0::numeric), p.contract_value) = 0::numeric then null::numeric
        else round(coalesce(nullif(p.total_contract_value, 0::numeric), p.contract_value)
                   - coalesce(sum(c.amount), 0::numeric)
                   - coalesce(sum(c.retention_amount), 0::numeric), 2)
    end as to_claim,
    round(coalesce(nullif(p.total_contract_value, 0::numeric), p.contract_value) - coalesce(sum(c.certified_amount), 0::numeric), 2) as balance_of_work,
    round(coalesce(sum(c.amount), 0::numeric) - coalesce(sum(c.certified_amount), 0::numeric), 2) as claimed_not_certified
from projects p
left join claims c on c.project_id = p.id
group by p.id, p.project_code, p.name, p.client_name, p.sales_manager, p.status, p.billing_status,
         p.follow_up_owner, p.work_type_code, p.contract_value, p.vo_value, p.total_contract_value;
