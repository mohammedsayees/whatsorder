begin;

select plan(10);

select ok(has_table_privilege('authenticated', 'public.jobs', 'select'), 'authenticated may read jobs through RLS');
select ok(not has_table_privilege('anon', 'public.jobs', 'select'), 'anon cannot select the private jobs table');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'insert'), 'authenticated cannot insert jobs directly');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'update'), 'authenticated cannot update jobs directly');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'delete'), 'authenticated cannot delete jobs directly');
select ok(not has_table_privilege('anon', 'public.job_reports', 'select'), 'anon cannot inspect reports');
select ok(not has_table_privilege('anon', 'public.job_events', 'select'), 'anon cannot inspect events');
select ok(has_function_privilege('anon', 'public.get_public_jobs(uuid,text,text,text,text,boolean,boolean,integer,integer)', 'execute'), 'anon may browse the safe projection');
select ok(not has_function_privilege('anon', 'public.report_public_job(uuid,text,text,text,text)', 'execute'), 'report RPC is server-only');
select ok(not has_function_privilege('authenticated', 'public.record_public_job_event(uuid,text,text)', 'execute'), 'event RPC is server-only');

select * from finish();
rollback;
