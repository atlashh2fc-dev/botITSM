-- Multitenancy already creates knowledge_articles_tenant_idx on tenant_id.
-- Remove the equivalent index introduced by the hardening migration so each
-- write maintains only one copy of the same btree.
set lock_timeout = '5s';
set statement_timeout = '30s';

drop index if exists public.knowledge_articles_tenant_id_idx;
