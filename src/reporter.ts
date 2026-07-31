import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisResult, TeamAnalysis } from "./analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class HtmlReporter {
  generate(result: AnalysisResult, outputDir: string, teamAnalysis?: TeamAnalysis): string {
    const prefix = teamAnalysis ? "Exact_" : "";
    const filePath = path.join(outputDir, `${prefix}autodesk_report.html`);

    if (teamAnalysis) {
      const dateStr = teamAnalysis.reportDate;
      const jsonPath = path.join(outputDir, `${prefix}autodesk_report_${dateStr}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(teamAnalysis, null, 2), "utf-8");
      console.log(`📄 JSON 数据已保存: ${jsonPath}`);
    }

    const availableDates: string[] = [];
    const allData: Record<string, TeamAnalysis> = {};
    try {
      const files = fs.readdirSync(outputDir);
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}autodesk_report_(\\d{4}-\\d{2}-\\d{2})\\.json$`);
      for (const f of files) {
        const match = f.match(re);
        if (match) {
          const date = match[1];
          availableDates.push(date);
          try {
            allData[date] = JSON.parse(fs.readFileSync(path.join(outputDir, f), "utf-8"));
          } catch { /* skip corrupted */ }
        }
      }
    } catch { /* directory may not exist */ }
    availableDates.sort();

    // Also include current teamAnalysis data
    if (teamAnalysis && !allData[teamAnalysis.reportDate]) {
      allData[teamAnalysis.reportDate] = teamAnalysis;
      availableDates.push(teamAnalysis.reportDate);
      availableDates.sort();
    }

    const html = teamAnalysis
      ? this.buildTeamOnlyHtml(teamAnalysis, availableDates, allData, prefix)
      : this.buildFullHtml(result);

    fs.mkdirSync(outputDir, { recursive: true });

    // Copy standalone JS next to the HTML so it can run on any platform
    const jsSource = path.join(__dirname, "team-report.js");
    if (fs.existsSync(jsSource)) {
      const jsPath = path.join(outputDir, `${prefix}autodesk_report.js`);
      fs.copyFileSync(jsSource, jsPath);
      console.log(`📄 JS 脚本已复制: ${jsPath}`);
    }

    fs.writeFileSync(filePath, html, "utf-8");
    console.log(`📄 HTML 报告已生成: ${filePath}`);
    return filePath;
  }

  private buildFullHtml(result: AnalysisResult): string {
    const userRows = this.buildUserTableRows(result);
    const productRows = this.buildProductTableRows(result);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autodesk 使用量报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #1a1a2e; }
    .meta { color: #666; margin-bottom: 32px; font-size: 14px; }
    .summary { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .summary-card { background: white; border-radius: 8px; padding: 20px 28px; box-shadow: 0 1px 3px rgba(0,0,0,.1); min-width: 180px; }
    .summary-card .label { font-size: 13px; color: #888; margin-bottom: 4px; }
    .summary-card .value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
    section { margin-bottom: 40px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #1a1a2e; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    th { background: #1a1a2e; color: white; padding: 12px 16px; text-align: left; font-weight: 600; font-size: 13px; }
    td { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    tr:nth-child(even) td { background: #fafafa; }
    tr:hover td { background: #eef2ff; }
    .bar-container { display: flex; align-items: center; gap: 8px; }
    .bar { height: 8px; background: linear-gradient(90deg, #4f46e5, #818cf8); border-radius: 4px; }
    .bar-value { font-size: 12px; color: #888; white-space: nowrap; }
    .csv-preview { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow-x: auto; }
    .csv-preview table { box-shadow: none; }
    .csv-preview th { background: #374151; white-space: nowrap; }
    .csv-preview td { white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Autodesk 使用量报告</h1>
    <p class="meta">生成时间: ${new Date().toLocaleString("zh-CN")} | 总记录数: ${result.totalRows}</p>
    <div class="summary">
      <div class="summary-card"><div class="label">总记录数</div><div class="value">${result.totalRows}</div></div>
      <div class="summary-card"><div class="label">用户数</div><div class="value">${result.byUser.size}</div></div>
      <div class="summary-card"><div class="label">产品数</div><div class="value">${result.byProduct.size}</div></div>
    </div>
    <section><h2>按用户统计</h2><table><thead><tr><th>用户</th><th>使用次数</th><th>占比</th></tr></thead><tbody>${userRows}</tbody></table></section>
    <section><h2>按产品统计</h2><table><thead><tr><th>产品</th><th>使用次数</th><th>占比</th></tr></thead><tbody>${productRows}</tbody></table></section>
    <section><h2>原始数据预览 (前 50 条)</h2><div class="csv-preview">${this.buildRawDataTable(result)}</div></section>
  </div>
</body>
</html>`;
  }

  private buildUserTableRows(result: AnalysisResult): string {
    const entries = [...result.byUser.entries()].sort((a, b) => b[1].count - a[1].count);
    const maxCount = entries.length > 0 ? entries[0][1].count : 1;
    return entries.map(([name, data]) => {
      const pct = ((data.count / result.totalRows) * 100).toFixed(1);
      return `<tr><td>${this.escapeHtml(name)}</td><td><div class="bar-container"><div class="bar" style="width:${(data.count/maxCount)*100}%"></div><span class="bar-value">${data.count}</span></div></td><td>${pct}%</td></tr>`;
    }).join("\n");
  }

  private buildProductTableRows(result: AnalysisResult): string {
    const entries = [...result.byProduct.entries()].sort((a, b) => b[1].count - a[1].count);
    const maxCount = entries.length > 0 ? entries[0][1].count : 1;
    return entries.map(([name, data]) => {
      const pct = ((data.count / result.totalRows) * 100).toFixed(1);
      return `<tr><td>${this.escapeHtml(name)}</td><td><div class="bar-container"><div class="bar" style="width:${(data.count/maxCount)*100}%"></div><span class="bar-value">${data.count}</span></div></td><td>${pct}%</td></tr>`;
    }).join("\n");
  }

  private buildRawDataTable(result: AnalysisResult): string {
    if (result.records.length === 0) return "<p>无数据</p>";
    const columns = result.columns;
    const preview = result.records.slice(0, 50);
    const header = columns.map((c) => `<th>${this.escapeHtml(c)}</th>`).join("");
    const rows = preview.map((r) => `<tr>${columns.map((c) => `<td>${this.escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`).join("\n");
    return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  private buildTeamOnlyHtml(team: TeamAnalysis, availableDates: string[], allData: Record<string, TeamAnalysis>, prefix: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Autodesk Report for Exact</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;color:#1e293b;padding:32px}
.container{max-width:1440px;margin:0 auto}
h1{font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-.3px}
.meta{color:#64748b;margin:8px 0 32px;font-size:13px;display:flex;align-items:center;gap:8px}
.meta select{padding:3px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;background:#fff;color:#1e293b;font-weight:500;cursor:pointer}
.meta select:focus{outline:2px solid #6366f1;border-color:transparent}
.summary{display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap}
.summary-card{background:#fff;border-radius:10px;padding:20px 28px;box-shadow:0 1px 2px rgba(0,0,0,.06);min-width:140px;border:1px solid #f1f5f9}
.summary-card .label{font-size:11px;color:#94a3b8;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.summary-card .value{font-size:28px;font-weight:700;color:#0f172a;line-height:1.2}
section{margin-bottom:36px}
h2{font-size:16px;font-weight:600;color:#0f172a;margin-bottom:14px}
.table-wrap{overflow-x:auto;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid #f1f5f9}
table{width:100%;border-collapse:collapse;min-width:1200px}
th{background:#f8fafc;color:#475569;padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.4px;cursor:pointer;user-select:none;white-space:nowrap;position:relative;border-bottom:2px solid #e2e8f0}
th .sort-icon{font-size:9px;margin-left:4px;opacity:.25}
th.sorted-asc .sort-icon,th.sorted-desc .sort-icon{opacity:1;color:#6366f1}
.filter-row th{background:#fff;padding:6px 8px;cursor:default;border-bottom:1px solid #e2e8f0}
.filter-row input,.filter-row select{width:100%;padding:5px 6px;font-size:11px;border:1px solid #e2e8f0;border-radius:5px;background:#fff;box-sizing:border-box;color:#1e293b}
.filter-row select{cursor:pointer}
.filter-row input:focus,.filter-row select:focus{outline:2px solid #6366f1;border-color:transparent}
.filter-row .cmp-row{display:flex;gap:2px}
.filter-row .cmp-row select{width:44px;flex-shrink:0}
.filter-row .cmp-row input{flex:1;min-width:0}
.filter-row .date-row{display:flex;gap:2px}
.filter-row .date-row select{width:50px;flex-shrink:0;font-size:10px}
.filter-row .date-row input{flex:1;min-width:0;font-size:11px}
td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155}
tr:last-child td{border-bottom:none}
tr:nth-child(even) td{background:#fafbfc}
tr:hover td{background:#f1f5f9}
.badge{display:inline-block;padding:2px 10px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:.2px}
.badge-active{background:#d1fae5;color:#065f46}
.badge-inactive{background:#fef2f2;color:#991b1b}
.rec-count{font-size:12px;color:#64748b;margin:0 0 10px 4px}
.rec-count strong{color:#0f172a}
.flagged-box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin-bottom:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.flagged-box h3{font-size:14px;font-weight:600;color:#0f172a;margin-bottom:14px;display:flex;align-items:center;gap:6px}
.flagged-box h3:before{content:'\\26A0';font-size:16px}
.flagged-box .param-row{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
.flagged-box .param-row label{font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.flagged-box .param-row label.avg-label{color:#d97706}
.flagged-box .param-row label.days-label{color:#6366f1}
.flagged-box .param-row input{width:68px;padding:5px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:5px;background:#fff;color:#1e293b;font-weight:500}
.flagged-box .param-row input:focus{outline:2px solid #6366f1;border-color:transparent}
.flagged-list{font-size:12px;color:#475569;margin-top:4px}
.flagged-item{display:contents}
.flagged-item .flag-dot{grid-column:var(--dot-col);justify-self:center;align-self:center}
.flagged-item .flag-id{grid-column:var(--id-col);font-weight:500;color:#1e293b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;align-self:center}
.flagged-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 5px;align-items:center}
.flag-dot,.flag-id{align-self:center}
.flag-dot{grid-column:var(--dot-col);grid-row:var(--row);justify-self:center}
.flag-id{grid-column:var(--id-col);grid-row:var(--row)}
.flag-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex-shrink:0;border:1px solid rgba(0,0,0,.06)}
.flag-dot-avg{background:#f59e0b}
.flag-dot-days{background:#6366f1}
.flag-dot-both{background:linear-gradient(135deg,#f59e0b 50%,#6366f1 50%)}
.cell-highlight-avg{background:#fef3c7!important;outline:1px solid #f59e0b40;outline-offset:-1px}
.cell-highlight-days{background:#e0e7ff!important;outline:1px solid #6366f140;outline-offset:-1px}
.cell-assign-recalc{background:#fef2f2!important;color:#dc2626!important;font-weight:600}
.info-icon{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#94a3b8;color:#fff;font-size:10px;font-weight:700;font-style:normal;cursor:help;line-height:1}
.recalc-note{font-size:11px;color:#64748b;margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;line-height:1.5}
.recalc-note code{background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:10px}
.flagged-row{background:#fef3c7!important}
.flagged-row:hover{background:#fde68a!important}
.flagged-row td{background:inherit!important}
.collapse-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:6px 0;margin-bottom:6px}
.collapse-toggle .arrow{font-size:10px;color:#94a3b8;transition:transform .2s}
.collapse-toggle.collapsed .arrow{transform:rotate(-90deg)}
.collapse-toggle h2{margin:0;padding:0;display:inline}
.collapse-content{overflow:hidden;transition:max-height .3s ease}
.collapse-content.collapsed{max-height:0}
.toolbar{display:flex;gap:8px;margin-bottom:12px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:12px;font-weight:600;border:none;border-radius:6px;cursor:pointer;transition:all .15s}
.btn-primary{background:#6366f1;color:#fff}
.btn-primary:hover{background:#4f46e5}
.btn-warning{background:#f59e0b;color:#fff}
.btn-warning:hover{background:#d97706}
.btn-outline{background:transparent;color:#64748b;border:1px solid #e2e8f0}
.btn-outline:hover{background:#f8fafc;color:#0f172a}
.highlight-count{font-size:12px;color:#475569;font-weight:600}
</style>
</head>
<body>
<div class="container">
<h1>Autodesk Report for Exact</h1>
<div class="meta">
  Report Date: <select id="reportDate" onchange="loadDate(this.value)">
    ${availableDates.map(d => `<option value="${d}">${d}</option>`).join('')}
  </select>
</div>
<div class="summary" id="summaryCards"></div>

<section>
<div class="flagged-box" id="flaggedBox">
<h3>Flagged Users</h3>
<div class="param-row">
<label class="avg-label">Monthly Avg &lt; <input id="flagMaxAvg" type="number" value="7" onchange="updateFlagged()" oninput="updateFlagged()"></label>
<label style="font-size:12px;font-weight:700;color:#64748b;gap:4px;display:inline-flex;align-items:center">
  <select id="flagMode" onchange="updateFlagged()" style="padding:3px 6px;font-size:11px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;color:#1e293b;font-weight:600;cursor:pointer">
    <option value="AND">AND</option>
    <option value="OR">OR</option>
  </select>
</label>
<label class="days-label">Days Since Last Access &gt; <input id="flagMinDays" type="number" value="7" onchange="updateFlagged()" oninput="updateFlagged()"></label>
</div>
<div id="flaggedList" class="flagged-list"></div>
</div>
</section>

<section>
<div class="collapse-toggle collapsed" id="detailToggle" onclick="toggleDetails()">
<span class="arrow">&#9660;</span>
<h2>User Details</h2>
</div>
<div class="collapse-content collapsed" id="detailContent">
<div class="toolbar">
<button class="btn btn-primary" onclick="clearFilters()">&#10227; Clear All Filters</button>
<button class="btn btn-warning" onclick="showFlaggedOnly()">&#9878; Show Flagged Only</button>
</div>
<div class="rec-count" id="recCount">Loading...</div>
<div class="table-wrap">
<table id="teamTable">
<thead id="tableHead"></thead>
<tbody id="tableBody"></tbody>
</table>
<div class="recalc-note" id="recalcNote" style="display:none"><span class="info-icon">i</span> Recalculated: <code>Days Used &divide; months since assign</code> &mdash; original in parentheses.</div>
</div>
</div>
</section>
</div>
<script>
var ALL_DATA = ${JSON.stringify(allData)};
var DATES = ${JSON.stringify(availableDates)};
</script>
<script src="${prefix}autodesk_report.js"></script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
