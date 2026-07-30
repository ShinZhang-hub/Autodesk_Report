export interface AutodeskConfig {
  baseUrl: string;
  /** URL path for the usage report page */
  usageReportPath: string;
  /** Team name keyword to filter by (case-insensitive partial match, e.g. "exact") */
  teamKeyword: string;
  /** Directory to save downloaded reports */
  downloadDir: string;
  /** Directory for output HTML reports */
  outputDir: string;
  /** Timeout in ms for wait operations */
  timeout: number;
  /** Headless mode - set false for manual login flow */
  headless: boolean;
  /** Path to saved browser state (cookies/localStorage) for skipping login */
  stateFile: string;
  /** Force re-login even if state file exists */
  forceLogin: boolean;
}

export const defaultConfig: AutodeskConfig = {
  baseUrl: "https://manage.autodesk.com",
  usageReportPath: "/usage-report",
  teamKeyword: "exact",
  downloadDir: "./downloads",
  outputDir: "./output",
  timeout: 60000,
  headless: false,
  stateFile: "./state/auth.json",
  forceLogin: false,
};
