const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/Muhsin/Desktop/3Echo/Docs/Doc (24.08.26)/Example Files/(8) PO 2608-0014 Sto (Coway - Seletar Factory).xlsx");
  const ws = wb.getWorksheet("PURCHASE ORDER");
  for(let rn=28;rn<=46;rn++){
    const row=ws.getRow(rn); const seen=[]; let last=null;
    for(let cn=1;cn<=18;cn++){
      const cell=row.getCell(cn); let v=cell.value;
      if(v&&typeof v==='object'){ if(v.richText)v=v.richText.map(t=>t.text).join(''); else if(v.result!=null)v=v.result; else if(v.formula)v='=F'; else if(v.text)v=v.text; else v=JSON.stringify(v); }
      v=String(v).replace(/\s+/g,' ').trim();
      if(v==='null'||v===''||v==='undefined')continue;
      if(v!==last){ seen.push(`[${cn}] ${v.slice(0,60)}`); last=v; }
    }
    if(seen.length) console.log(`R${rn}: `+seen.join("  ||  "));
  }
})().catch(e=>{console.error(e);process.exit(1)});
