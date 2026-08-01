import { db } from "./index";
import { readFileSync } from "fs";

const sql = readFileSync("src/db/triggers.sql", "utf8");

// Split triggers by blank lines (safe for BEGIN/END blocks)
const statements = sql
  .split(/\n\s*\n/) // split on empty line
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  db.run(stmt); // run each trigger as a full statement
}

console.log("Triggers installed successfully.");
