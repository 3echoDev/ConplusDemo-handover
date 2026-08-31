const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/Muhsin/Desktop/3Echo/Docs/Doc (24.08.26)/Example Files/(8) PO 2608-0014 Sto (Coway - Seletar Factory).xlsx");
  const ws = wb.getWorksheet("PURCHASE ORDER");
  ws.eachRow({includeEmpty:false},(row,rn)=>{
    const seen=[]; let last=null;
    row.eachCell({includeEmpty:false},(cell,cn)=>{
      let v=cell.value;
      if(v&&typeof v==='object'){ if(v.richText)v=v.richText.map(t=>t.text).join(''); else if(v.result!=null)v=v.result; else if(v.text)v=v.text; else v=JSON.stringify(v); }
      v=String(v).replace(/\s+/g,' ').trim();
      if(v==='null'||v==='')return;
      if(v!==last){ seen.push(`[${cn}] ${v.slice(0,70)}`); last=v; }
    });
    if(seen.length) console.log(`R${rn}: `+seen.join("  ||  "));
  });
})().catch(e=>{console.error(e);process.exit(1)});
