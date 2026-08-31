const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/Muhsin/Desktop/3Echo/Docs/Doc (24.08.26)/Example Files/(8) PO 2608-0014 Sto (Coway - Seletar Factory).xlsx");
  console.log("SHEETS:", wb.worksheets.map(w=>w.name).join(" | "));
  const ws = wb.getWorksheet("PURCHASE ORDER") || wb.worksheets[0];
  console.log("=== SHEET:", ws.name, "rows:", ws.rowCount, "cols:", ws.columnCount);
  ws.eachRow({includeEmpty:false},(row,rn)=>{
    const cells=[];
    row.eachCell({includeEmpty:false},(cell,cn)=>{
      let v=cell.value;
      if(v&&typeof v==='object'){ if(v.richText)v=v.richText.map(t=>t.text).join(''); else if(v.result!=null)v=v.result; else if(v.text)v=v.text; else v=JSON.stringify(v); }
      cells.push(`C${cn}=${String(v).replace(/\s+/g,' ').trim()}`);
    });
    if(cells.length) console.log(`R${rn}: `+cells.join(" | "));
  });
})().catch(e=>{console.error(e);process.exit(1)});
