import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolvePeriod } from "@/lib/period";
import { buildReport, REPORT_TYPES, type ReportKey } from "@/lib/services/reports";
import { getSetting } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s || !can(s.role, "reports.view")) return new Response("Não autorizado", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const key = (sp.get("tipo") || "vendas_vendedor") as ReportKey;
  if (!REPORT_TYPES.some((r) => r.key === key)) return new Response("Relatório inválido", { status: 400 });
  const period = resolvePeriod(sp.get("p") ?? "mes", sp.get("de") ?? undefined, sp.get("ate") ?? undefined);
  const data = await buildReport(key, period.from, period.to);
  const company = await getSetting<{ name: string }>("company", { name: "Forte Company" });
  const fname = `${key}-${period.from.toISOString().slice(0, 10)}`;

  if (sp.get("formato") === "pdf") {
    const buf = await new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({ size: "A4", layout: data.columns.length > 6 ? "landscape" : "portrait", margin: 36 });
      const chunks: Buffer[] = []; doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.fillColor("#D91E3A").fontSize(10).text(company.name.toUpperCase(), { continued: true }).fillColor("#111").text("  ·  FORTE CRM");
      doc.moveDown(0.3).fontSize(18).fillColor("#111").text(data.title); doc.fontSize(10).fillColor("#666").text(`${data.subtitle} · gerado em ${new Date().toLocaleString("pt-BR")} por ${s.name}`); doc.moveDown(0.8);
      const W = doc.page.width - 72; const cw = W / data.columns.length; let y = doc.y;
      const row = (cells: (string | number)[], bold = false, fill?: string) => {
        if (y > doc.page.height - 60) { doc.addPage(); y = 36; }
        if (fill) doc.rect(36, y - 2, W, 16).fill(fill);
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#111");
        cells.forEach((c, i) => doc.text(String(c ?? ""), 36 + i * cw + 3, y, { width: cw - 6, height: 14, ellipsis: true }));
        y += 16;
      };
      row(data.columns, true, "#F3F4F6");
      data.rows.forEach((r, i) => row(r, false, i % 2 ? "#FAFAFA" : undefined));
      if (data.totals) row(data.totals, true, "#FDEEF1");
      if (!data.rows.length) { doc.font("Helvetica").fontSize(9).fillColor("#666").text("Sem registros no período.", 36, y + 4); }
      doc.end();
    });
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}.pdf"` } });
  }

  const wb = new ExcelJS.Workbook(); wb.creator = company.name;
  const ws = wb.addWorksheet(data.title.slice(0, 30));
  ws.addRow([data.title]).font = { bold: true, size: 14 }; ws.addRow([data.subtitle]).font = { color: { argb: "FF666666" } }; ws.addRow([]);
  const header = ws.addRow(data.columns); header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111114" } }; });
  data.rows.forEach((r) => ws.addRow(r));
  if (data.totals) { const tr = ws.addRow(data.totals); tr.font = { bold: true }; tr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDEEF1" } }; }); }
  ws.columns.forEach((col) => { let max = 10; col.eachCell?.({ includeEmpty: false }, (c) => { max = Math.max(max, String(c.value ?? "").length + 2); }); col.width = Math.min(45, max); });
  const out = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(out as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fname}.xlsx"` } });
}
