-- Run once in Supabase Dashboard > SQL Editor before Django migrations.
-- Django remains the only owner of application tables and authentication data.

begin;

create schema if not exists gis;
create extension if not exists postgis with schema gis;

-- Keep Django tables outside `public`, which is exposed by the Supabase Data API.
create schema if not exists hoopmap;
comment on schema hoopmap is 'Private HOOPMAP schema managed by Django migrations';

revoke all on schema hoopmap from anon, authenticated;
grant usage, create on schema hoopmap to postgres;

commit;
