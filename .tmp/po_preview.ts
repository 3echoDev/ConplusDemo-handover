import { writeFileSync } from "node:fs";
import { buildPOHtml } from "@/lib/poDocument";
import type { PurchaseOrder } from "@/data/sampleData";

// Real data pulled from Supabase (PO 2607-0018) plus a couple of illustrative
// item codes / a discounted line so every template column is exercised.
const po: PurchaseOrder = {
  id: "preview",
  poNumber: "2607-0018",
  supplier: "Sto SEA Pte Ltd",
  supplierAddress: "159 Sin Ming Road, #06-02, Amtech Building, Singapore 575625",
  supplierContact: "Mr Eric Tan",
  supplierPhone: "6453 3080",
  supplierEmail: "eric.tan@sto.com",
  project: "Lot 02853T TS18, Northumberland Road (Kallang Planning Area)",
  projectId: "",
  projectCode: "E24011",
  worksOrder: "WO24054.1R1-E24011",
  shipTo: "Piccadilly Grand & Piccadilly Galleria, Northumberland Road",
  paymentTerms: "60 DAYS",
  requestedBy: "Jensen",
  remarks: "Deliver to site store; coordinate with site I/C before delivery.",
  amount: 80557.45,
  gst: 7250.17,
  status: "issued",
  createdDate: "2026-08-29",
  deliveryDate: "2026-09-10",
  vendorQuotationRef: "STO-Q-2026-0417",
  attnName: "Mr Eric Tan",
  deliveryCharge: 0,
  vendorCode: "STO",
  projectPic: "Brandan",
  deliveryAddress: "Piccadilly Grand, Northumberland Road, Singapore",
  deliveryContact: "Site I/C",
  deliveryContactNumber: "9123 4567",
  items: [
    { material: "StoPox WL 100 (RAL 7037) - Driveway", qty: 136, unitPrice: 127.35, unit: "set", itemCode: "WL100 7037_30", discPerUnit: 0 },
    { material: "StoPox WL 100 (RAL 7038) - Carpark Lot", qty: 140, unitPrice: 127.35, unit: "set", itemCode: "WL100 7038_30", discPerUnit: 0 },
    { material: "StoPox WL 100 (RAL 6017) - EV Lot", qty: 2, unitPrice: 127.35, unit: "set", itemCode: "WL100 6017_30", discPerUnit: 0 },
    { material: "StoPox WG100-50% (RAL 7037)", qty: 116, unitPrice: 108.0, unit: "set", itemCode: "WG100 7037_20", discPerUnit: 3.5 },
    { material: "StoCrete PU SM 1mm", qty: 186, unitPrice: 46.81, unit: "set", itemCode: "PUSM 1MM_25", discPerUnit: 0 },
    { material: "StoPox WG100 (Clear)", qty: 203, unitPrice: 117.83, unit: "set", itemCode: "WG100 Clear_20", discPerUnit: 0 },
  ],
};

const out = "C:/Users/Muhsin/Downloads/PO_preview_2607-0018.html";
const html = buildPOHtml(po, { autoPrint: false }).replace(
  'src="/conplus-header.png"',
  'src="file:///C:/Users/Muhsin/Downloads/conplus.png"',
);
writeFileSync(out, html, "utf8");
console.log("Wrote", out);
