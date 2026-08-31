const E = require("exceljs");
const wb = new E.Workbook();
wb.xlsx.readFile("C:/Users/Muhsin/Downloads/Works Order WO-E25057-DRAFT.xlsx").then(() => {
  wb.eachSheet((s) => {
    console.log("=== SHEET:", s.name, "rows", s.rowCount);
    s.eachRow((r, i) => {
      const vals = r.values.slice(1).map((v) => (v && v.result !== undefined ? v.result : v)).map((v) => (v == null ? "" : String(v)));
      if (vals.join("").trim()) console.log(i, "|", vals.join(" | "));
    });
  });
}).catch((e) => console.log("ERR", e.message));
