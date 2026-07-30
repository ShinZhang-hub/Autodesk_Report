import { AutodeskClient } from "./autodesk.js";
import { CsvAnalyzer } from "./analyzer.js";
import { HtmlReporter } from "./reporter.js";
import { AutodeskConfig, defaultConfig } from "./config.js";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const teamKeyword = args.find((a) => a.startsWith("--team="))?.split("=")[1]
    || args.find((a) => a.startsWith("--keyword="))?.split("=")[1]
    || process.env.AUTODESK_TEAM
    || defaultConfig.teamKeyword;
  const isDebug = args.includes("--debug") || args.includes("-d");
  const forceLogin = args.includes("--force-login") || args.includes("-f");

  // --csv flag to skip web automation and analyze an existing CSV
  const csvPathArg = args.find((a) => a.startsWith("--csv="))?.split("=")[1];
  // --team-filter flag to filter records by team_alias (case-insensitive) in CSV mode
  const teamFilterArg = args.find((a) => a.startsWith("--team-filter="))?.split("=")[1];

  const config: AutodeskConfig = {
    ...defaultConfig,
    teamKeyword,
    forceLogin,
  };

  if (csvPathArg) {
    // Analysis-only mode: skip web automation
    await runAnalysis(csvPathArg, config.outputDir, teamFilterArg);
    return;
  }

  // Web automation + analysis mode
  console.log("=== Autodesk 使用量报告自动化工具 ===\n");
  console.log(`配置:`);
  console.log(`  网站: ${config.baseUrl}`);
  console.log(`  Team 关键词: "${config.teamKeyword}"`);
  console.log(`  下载目录: ${config.downloadDir}`);
  console.log(`  输出目录: ${config.outputDir}`);
  if (isDebug) console.log(`  模式: DEBUG`);
  console.log();

  const client = new AutodeskClient(config);

  try {
    await client.init();
    await client.login();

    if (isDebug) {
      await client.dumpPageText();
      await client.screenshot("usage-report-page");
      console.log("\n按 Enter 退出...");
      await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
      await client.close();
      return;
    }

    await client.selectTeam();

    const csvPath = await client.downloadReport();
    if (!csvPath) {
      console.error("❌ 未能获取 CSV 文件");
      return;
    }

    await runAnalysis(csvPath, config.outputDir);
  } catch (error) {
    console.error("❌ 执行失败:", error);
  } finally {
    await client.close();
  }
}

async function runAnalysis(csvPath: string, outputDir: string, teamFilter?: string) {
  const analyzer = new CsvAnalyzer();
  const reporter = new HtmlReporter();

  console.log("\n📊 开始分析 CSV...");
  analyzer.load(csvPath);
  const result = analyzer.analyze();
  console.log(`   用户数: ${result.byUser.size}`);
  console.log(`   产品数: ${result.byProduct.size}`);

  const csvDir = path.dirname(csvPath);
  const readmePath = path.join(csvDir, "readme.csv");
  let reportDate: string | undefined;
  if (fs.existsSync(readmePath)) {
    const readmeContent = fs.readFileSync(readmePath, "utf-8");
    for (const line of readmeContent.split("\n")) {
      const parts = line.split(",");
      if (parts[0]?.trim() === "end_date" && parts[1]) {
        reportDate = parts[1].trim().replace(/"/g, "");
        console.log(`📅 报告日期: ${reportDate}`);
        break;
      }
    }
  }

  let teamAnalysis;
  if (teamFilter) {
    console.log(`\n🔍 按 team_alias 过滤 "${teamFilter}" (不区分大小写)...`);
    teamAnalysis = analyzer.analyzeTeamUsers(teamFilter, reportDate);
    console.log(`   匹配记录: ${teamAnalysis.totalRecords}, 去重用户: ${teamAnalysis.uniqueUsers}`);
  }

  console.log("\n📄 开始生成 HTML 报告...");
  const htmlPath = reporter.generate(result, outputDir, teamAnalysis);

  console.log(`\n✅ 完成！HTML 报告: ${htmlPath}`);
}

main().catch(console.error);
