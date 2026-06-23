UPDATE "Employees"
SET 
  "IndemniteTransport" = (random() * 20000 + 10000)::numeric(18,2),
  "IndemniteLogement"  = (random() * 30000 + 15000)::numeric(18,2),
  "PrimeAnciennete"   = (random() * 10000 + 5000)::numeric(18,2);

DELETE FROM "PayrollDetails";
DELETE FROM "PayrollPeriods";

SELECT "FirstName", "LastName", "IndemniteTransport", "IndemniteLogement", "PrimeAnciennete" FROM "Employees" LIMIT 5;
