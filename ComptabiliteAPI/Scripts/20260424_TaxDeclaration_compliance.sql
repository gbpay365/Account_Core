-- Phase A–B: ECF workflow & DGI correlation (run against PostgreSQL before using new features)
-- Safe to run multiple times:

ALTER TABLE "TaxDeclarations" ADD COLUMN IF NOT EXISTS "CorrelationId" uuid NULL;
ALTER TABLE "TaxDeclarations" ADD COLUMN IF NOT EXISTS "LockedAt" timestamp with time zone NULL;

COMMENT ON COLUMN "TaxDeclarations"."CorrelationId" IS 'End-to-end id for télédéclaration / audit logs';
COMMENT ON COLUMN "TaxDeclarations"."LockedAt" IS 'When set, in-app changes to this row should be blocked (workflow)';
