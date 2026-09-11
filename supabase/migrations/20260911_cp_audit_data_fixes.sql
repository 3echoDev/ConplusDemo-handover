-- ConPlus audit-log DATA fixes, 2026-09-11. Run AFTER 20260911_cp_audit_claims_write_path.sql.
-- Idempotent.

begin;

-- CP07: canonicalise stored sales managers (trigger handles future writes).
update projects
   set sales_manager = public.match_salesperson(sales_manager)
 where sales_manager is not null
   and public.match_salesperson(sales_manager) is not null
   and public.match_salesperson(sales_manager) <> sales_manager;

-- CP07: E25077 is an active job with a live claim → WIP so it appears in the
-- default management-summary filter alongside Wan Fern's other WIP projects.
update projects set billing_status = 'WIP'
 where project_code = 'E25077' and billing_status is null;

-- CP11 / CP12: E25077 claim 01 schedule from the client-corrected master
-- "(Corrected)E25077_HPC_STA_Progress_Claim_01.xlsx" (11 section-A items).
do $$
declare v_claim uuid;
begin
  select id into v_claim from claims where claim_number = 'CLM-E25077-1';
  if v_claim is null then raise exception 'CLM-E25077-1 not found'; end if;

  perform public.save_claim_lines(v_claim, $j$[
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":1,"pg_ref":"A1","zone":"H92 ZONE 28 - WST",
     "description":"To Floor\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne Coat of Primer, StoPox GH 532\nTwo Coats of Grout Coat, StoPox BB OS\nTwo Coats of Epoxy Coat, StoPox BB OS",
     "unit":"m2","qty":759,"rate":50,"prev_qty":0,"curr_qty":107.64,"remarks":"Work Done: 17-23 Aug'26 - 1st Storey"},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":2,"pg_ref":"A2","zone":"H92 ZONE 29 - EQL TANK",
     "description":"To Floor - Confine Space\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne Coat of Primer, StoPox GH 532\nTwo Coats of Grout Coat, StoPox BB OS\nTwo Coats of Epoxy Coat, StoPox BB OS",
     "unit":"m2","qty":488,"rate":50,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":3,"pg_ref":"A3","zone":"H92 ZONE 29 - EQL TANK",
     "description":"To Wall\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":6,"rate":22,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":4,"pg_ref":"A4","zone":"H92 ZONE 29 - EQL TANK",
     "description":"To Wall - Confine Space\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":1098,"rate":22,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":5,"pg_ref":"A5","zone":"H92 ZONE 29 - EQL TANK",
     "description":"Ditto, upturn 300mm - Confine Space","unit":"m","qty":155,"rate":30,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":6,"pg_ref":"A6","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to basement ground collection tank",
     "description":"To Floor - Confine Space\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne Coat of Primer, StoPox GH 532\nTwo Coats of Grout Coat, StoPox BB OS\nTwo Coats of Epoxy Coat, StoPox BB OS",
     "unit":"m2","qty":25,"rate":50,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":7,"pg_ref":"A7","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to basement ground collection tank",
     "description":"To Wall - Confine Space\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":94,"rate":22,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":8,"pg_ref":"A8","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to basement ground collection tank",
     "description":"To Ceiling - Confine Space\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":25,"rate":22,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":9,"pg_ref":"A9","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to Chemical dosing room",
     "description":"To Floor\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne Coat of Primer, StoPox GH 532\nTwo Coats of Grout Coat, StoPox BB OS\nTwo Coats of Epoxy Coat, StoPox BB OS",
     "unit":"m2","qty":267,"rate":50,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":10,"pg_ref":"A10","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to Chemical dosing room",
     "description":"To Wall\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":16,"rate":22,"prev_qty":0,"curr_qty":0},
    {"section":"A","quotation_ref":"Q26259-2E/082026/186/WF","seq":11,"pg_ref":"A11","zone":"H92 ZONE 30 - UTILITIES COMPLEX: Epoxy to Chemical dosing room",
     "description":"To Ceiling\nSurface preparation by Mechanical Grinding & Vacuum clean.\nOne coat of Primer, StoPox WL 100\nOne coat of Base Coat, StoPox WL 100\nOne coat of Top Coat, StoPox WL 100",
     "unit":"m2","qty":129,"rate":22,"prev_qty":0,"curr_qty":0}
  ]$j$::jsonb);

  -- Gross work done 107.64 m2 × $50 = $5,382.00; retention 10% = $538.20; net = $4,843.80 (already stored).
  perform public.update_claim(v_claim, '{"total_claim": 5382.00, "retention_amount": 538.20, "amount": 4843.80, "description": "Supply & Installation of Epoxy Coating to Floor, Wall & Ceiling at Building H92"}'::jsonb);
end $$;

commit;
