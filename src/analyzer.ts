import fs from "node:fs";
import { parse } from "csv-parse/sync";

export interface UsageRecord {
  [key: string]: string;
}

export interface AnalysisResult {
  totalRows: number;
  columns: string[];
  /** Aggregated by user */
  byUser: Map<string, { count: number; records: UsageRecord[] }>;
  /** Aggregated by product */
  byProduct: Map<string, { count: number; records: UsageRecord[] }>;
  /** Raw records */
  records: UsageRecord[];
}

export interface TeamUserDetail {
  email: string;
  firstName: string;
  lastName: string;
  teamAlias: string;
  userActivity: string;
  daysInactive: string;
  daysUsed: string;
  monthlyAverage: string;
  lastAccessed: string;
  product: string;
  assignDate: string;
}

export interface TeamAnalysis {
  reportDate: string;
  teamKeyword: string;
  totalRecords: number;
  uniqueUsers: number;
  users: TeamUserDetail[];
}

/**
 * Parse CSV file and perform analysis.
 * Customize the `analyze` method based on your specific reporting needs.
 */
export class CsvAnalyzer {
  private records: UsageRecord[] = [];

  /**
   * Load and parse a CSV file.
   */
  load(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    this.records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    console.log(`📋 已解析 CSV: ${this.records.length} 条记录, ${this.getColumns().length} 列`);
  }

  getColumns(): string[] {
    if (this.records.length === 0) return [];
    return Object.keys(this.records[0]);
  }

  getRecords(): UsageRecord[] {
    return this.records;
  }

  /**
   * Run the full analysis pipeline.
   * Extend this method with custom analysis logic.
   */
  analyze(): AnalysisResult {
    const byUser = new Map<string, { count: number; records: UsageRecord[] }>();
    const byProduct = new Map<string, { count: number; records: UsageRecord[] }>();

    for (const record of this.records) {
      // Guess common column names for user and product
      const userKey = record["User Name"]
        || record["user"]
        || record["User"]
        || record["Email"]
        || record["email"]
        || "Unknown";

      const productKey = record["offering_name"]
        || record["Offering Name"]
        || record["Product"]
        || record["product"]
        || record["Product Name"]
        || record["Application"]
        || record["app"]
        || "Unknown";

      // Aggregate by user
      if (!byUser.has(userKey)) {
        byUser.set(userKey, { count: 0, records: [] });
      }
      const u = byUser.get(userKey)!;
      u.count++;
      u.records.push(record);

      // Aggregate by product
      if (!byProduct.has(productKey)) {
        byProduct.set(productKey, { count: 0, records: [] });
      }
      const p = byProduct.get(productKey)!;
      p.count++;
      p.records.push(record);
    }

    return {
      totalRows: this.records.length,
      columns: this.getColumns(),
      byUser,
      byProduct,
      records: this.records,
    };
  }

  filterByTeam(keyword: string): UsageRecord[] {
    if (!keyword) return this.records;
    const re = new RegExp(keyword, "i");
    return this.records.filter((r) => {
      const team = r["team_alias"] || r["Team Alias"] || r["Team"] || r["team"] || "";
      return re.test(team);
    });
  }

  analyzeTeamUsers(keyword: string, reportDate?: string): TeamAnalysis {
    const filtered = this.filterByTeam(keyword);
    const seen = new Set<string>();
    const users: TeamUserDetail[] = [];

    for (const r of filtered) {
      const email = r["email"] || r["Email"] || "";
      if (seen.has(email)) continue;
      seen.add(email);

      users.push({
        email,
        firstName: r["first_name"] || r["First Name"] || "",
        lastName: r["last_name"] || r["Last Name"] || "",
        teamAlias: r["team_alias"] || r["Team Alias"] || "",
        userActivity: r["user_activity"] || r["User Activity"] || "",
        daysInactive: r["days_inactive"] || r["Days Inactive"] || "",
        daysUsed: r["days_used"] || r["Days Used"] || "",
        monthlyAverage: r["monthly_average"] || r["Monthly Average"] || "",
        lastAccessed: r["last_accessed"] || r["Last Accessed"] || "",
        product: r["offering_name"] || r["Offering Name"] || "",
        assignDate: r["assigned_date"] || "",
      });
    }

    return {
      reportDate: reportDate || new Date().toISOString().slice(0, 10),
      teamKeyword: keyword,
      totalRecords: filtered.length,
      uniqueUsers: users.length,
      users,
    };
  }
}
