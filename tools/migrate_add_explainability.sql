-- Migration: add explainability JSONB column to public.transactions
-- Safe to run repeatedly
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS explainability JSONB;
