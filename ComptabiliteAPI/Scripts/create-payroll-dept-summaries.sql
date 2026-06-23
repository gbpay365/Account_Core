CREATE TABLE IF NOT EXISTS "PayrollDepartmentSummaries" (
  "Id" uuid PRIMARY KEY,
  "CompanyId" uuid NOT NULL,
  "Year" integer NOT NULL,
  "Month" integer NOT NULL,
  "Department" text NOT NULL DEFAULT '',
  "Headcount" integer NOT NULL DEFAULT 0,
  "GrossPayroll" numeric NOT NULL DEFAULT 0,
  "NetPayroll" numeric NOT NULL DEFAULT 0,
  "EmployerCharges" numeric NOT NULL DEFAULT 0,
  "UpdatedAt" timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_PayrollDepartmentSummaries_PeriodDept"
  ON "PayrollDepartmentSummaries" ("CompanyId", "Year", "Month", "Department");
