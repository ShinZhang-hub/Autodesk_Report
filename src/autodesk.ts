import { Browser, BrowserContext, Page, chromium } from "playwright";
import { AutodeskConfig } from "./config.js";
import fs from "node:fs";
import path from "node:path";

export class AutodeskClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private config: AutodeskConfig) {}

  async init(): Promise<void> {
    fs.mkdirSync(this.config.downloadDir, { recursive: true });
    fs.mkdirSync(this.config.outputDir, { recursive: true });

    const launchOptions: any = {
      headless: this.config.headless,
    };

    this.browser = await chromium.launch(launchOptions);

    // Load saved auth state if available and not forcing re-login
    const contextOptions: any = {
      acceptDownloads: true,
    };

    if (!this.config.forceLogin && fs.existsSync(this.config.stateFile)) {
      console.log("🔑 发现已保存的登录状态，跳过登录\n");
      contextOptions.storageState = this.config.stateFile;
    }

    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);
  }

  async login(): Promise<void> {
    if (!this.page) throw new Error("Client not initialized");

    const hasSavedState = !this.config.forceLogin && fs.existsSync(this.config.stateFile);

    // Go directly to the usage report page (it will trigger auth if needed)
    const reportUrl = this.config.baseUrl + this.config.usageReportPath;
    await this.page.goto(reportUrl, { waitUntil: "domcontentloaded" });

    if (hasSavedState) {
      // Quick check if saved state is still valid
      try {
        await this.waitForReportReady(10000);
        console.log("✅ 自动登录成功（复用上次会话）\n");
        return;
      } catch {
        console.log("⏳ 上次的登录状态已过期，需要重新认证...\n");
      }
    } else {
      console.log("⏳ 请在打开的浏览器中完成认证（登录 + 图片验证 + 邮件验证码）...");
      console.log("   验证完成后脚本将自动继续\n");
    }

    // Wait for the report page to fully load (auth completed)
    await this.waitForReportReady(300000);
    console.log("✅ 认证完成！\n");

    // Save full session state
    await this.saveState();
  }

  /**
   * Wait until the usage report page is fully loaded and the team selector is visible.
   */
  private async waitForReportReady(timeout: number): Promise<void> {
    if (!this.page) throw new Error("Client not initialized");

    // Wait for key elements that indicate the report UI is loaded
    await this.page.waitForFunction(
      () => {
        const selectors = [
          '[data-testid="team-selector__select"]',
          '[data-testid="team-selector"]',
          '.team-selector',
          '[class*="usage-report"]',
        ];
        return selectors.some((sel) => document.querySelector(sel));
      },
      null,
      { timeout },
    );

    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(2000);
  }

  private async saveState(): Promise<void> {
    if (!this.context) return;
    fs.mkdirSync(path.dirname(this.config.stateFile), { recursive: true });
    await this.context.storageState({ path: this.config.stateFile });
    console.log(`💾 登录状态已保存到 ${this.config.stateFile}（下次自动复用）\n`);
  }

  /**
   * Select a team containing the keyword (case-insensitive) from the team dropdown.
   * The team selector is a MUI custom select: [data-testid="team-selector__select"]
   */
  async selectTeam(): Promise<void> {
    if (!this.page) throw new Error("Client not initialized");

    const keyword = this.config.teamKeyword;
    if (!keyword) {
      console.log("⚠️  未指定 team 关键词，跳过 team 选择\n");
      return;
    }

    console.log(`🔍 正在查找包含 "${keyword}" 的 team...`);

    // Wait for the MUI select to be present and visible
    const selectTrigger = this.page.locator('[data-testid="team-selector__select"]');
    try {
      await selectTrigger.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      console.log("⚠️  未找到 team 下拉框，截图和页面文本已保存");
      await this.screenshot("team-select");
      await this.dumpPageText();
      console.log("   请手动选择 team 后按 Enter 继续...");
      await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
      return;
    }

    await selectTrigger.click();
    console.log("  已打开 team 下拉菜单");
    await this.page.waitForTimeout(800);

    // MUI Menu items are rendered in a portal with role="option"
    const optionLoc = this.page.locator('[role="option"]').filter({
      hasText: new RegExp(keyword, "i"),
    }).first();

    try {
      await optionLoc.waitFor({ state: "visible", timeout: 5000 });
      const teamText = await optionLoc.textContent();
      await optionLoc.click();
      console.log(`✅ 已选择 team: "${teamText?.trim()}"\n`);
    } catch {
      console.log(`⚠️  未找到包含 "${keyword}" 的 team 选项`);
      await this.screenshot("team-options");
      console.log("   请手动选择 team 后按 Enter 继续...");
      await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
    }
  }

  /**
   * Click the Export button, then select CSV in the popup.
   */
  async downloadReport(): Promise<string | null> {
    if (!this.page) throw new Error("Client not initialized");

    console.log("📥 正在下载使用量报告...");

    // Click the Export button
    const exportBtns = [
      'button:has-text("Export")',
      'a:has-text("Export")',
      '[class*="export"] button',
      'button[class*="export"]',
      '[data-testid="export-btn"]',
    ];

    let exportClicked = false;
    for (const sel of exportBtns) {
      try {
        const loc = this.page.locator(sel).first();
        if (await loc.isVisible({ timeout: 2000 })) {
          console.log(`  找到 Export 按钮: ${sel}`);
          await loc.click();
          exportClicked = true;
          await this.page.waitForTimeout(1500);
          break;
        }
      } catch {}
    }

    if (!exportClicked) {
      console.log("⚠️  未找到 Export 按钮");
      await this.screenshot("export-button");
      console.log("   请手动点击 Export 后按 Enter 继续...");
      await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
    }

    // Set up download listener
    console.log("   正在导出 CSV...");
    const downloadPromise = this.page.waitForEvent("download", {
      timeout: this.config.timeout,
    });

    // Look for CSV option in the popup and click to confirm
    const csvLocators = [
      this.page.locator('button, a, span, label', { hasText: /csv/i }).first(),
      this.page.locator('button:has-text("CSV")'),
      this.page.locator('input[value="csv"], input[value="CSV"]'),
      this.page.locator('[data-value="csv"], [data-value="CSV"]'),
    ];

    let csvClicked = false;
    for (const loc of csvLocators) {
      try {
        if (await loc.isVisible({ timeout: 2000 })) {
          await loc.click();
          csvClicked = true;
          console.log("  已选择 CSV 格式");
          await this.page.waitForTimeout(1000);
          break;
        }
      } catch {}
    }

    // If CSV wasn't explicitly clicked, maybe the dialog auto-submits
    // Try clicking any "Export"/"Download" button inside a dialog
    if (!csvClicked) {
      const confirmBtns = [
        'dialog button:has-text("Export")',
        'dialog button:has-text("Download")',
        '[role="dialog"] button:has-text("Export")',
        '[role="dialog"] button:has-text("CSV")',
        'button:has-text("确定")',
        'button:has-text("确认")',
      ];
      for (const sel of confirmBtns) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.isVisible({ timeout: 1500 })) {
            await loc.click();
            csvClicked = true;
            console.log(`  点击了确认按钮: ${sel}`);
            break;
          }
        } catch {}
      }
    }

    if (!csvClicked) {
      // Maybe the export already triggered without explicit CSV selection
      console.log("  尝试直接触发导出...");
      const fallbackBtns = [
        'button:has-text("Export")',
        'button:has-text("Download")',
        'a:has-text("Download")',
      ];
      for (const sel of fallbackBtns) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.isVisible({ timeout: 1000 })) {
            await loc.click();
            csvClicked = true;
            break;
          }
        } catch {}
      }
    }

    // Wait for download
    try {
      const download = await downloadPromise;
      const filePath = path.join(this.config.downloadDir, download.suggestedFilename());
      await download.saveAs(filePath);
      console.log(`✅ 报告已下载: ${filePath}\n`);
      return filePath;
    } catch {
      console.log("⚠️  下载超时");
      await this.screenshot("export-dialog");
      console.log("   请手动下载后放入 downloads/ 目录，按 Enter 继续...");
      await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
      return this.findLatestCsv();
    }
  }

  async screenshot(name: string): Promise<void> {
    if (!this.page) return;
    const dir = path.join(this.config.downloadDir, "screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    console.log(`📸 截图: ${filePath}`);
  }

  async dumpPageText(): Promise<void> {
    if (!this.page) return;
    const text = await this.page.innerText("body");
    console.log("📄 页面文本内容:");
    console.log(text.slice(0, 3000));
  }

  private findLatestCsv(): string | null {
    const dir = this.config.downloadDir;
    if (!fs.existsSync(dir)) return null;

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
      console.log(`📄 找到最新 CSV: ${files[0].path}`);
      return files[0].path;
    }
    return null;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
