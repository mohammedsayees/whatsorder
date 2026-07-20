-- DEVELOPMENT ONLY. This file is not part of the migration chain.
-- Before running locally: set app.environment = 'development';
do $$
declare
  rid uuid;
begin
  if current_setting('app.environment', true) <> 'development' then
    raise exception 'Refusing to seed jobs outside an explicitly marked development database';
  end if;
  select id into rid from public.restaurants order by created_at limit 1;
  if rid is null then raise exception 'Create a development restaurant first'; end if;

  insert into public.jobs (
    restaurant_id, title, category, employment_type, emirate, city,
    salary_type, salary_min, salary_max, number_of_vacancies,
    immediate_joining, accommodation_provided, contact_whatsapp,
    status, published_at, expires_at, description
  ) values
    (rid, 'Shawarma Maker', 'Shawarma Maker', 'Full-time', 'Ajman', 'Ajman', 'Range', 2500, 3200, 2, true, true, '971501234567', 'published', now(), now() + interval '30 days', 'Prepare shawarma consistently and keep the station clean.'),
    (rid, 'Barista', 'Barista', 'Full-time', 'Dubai', 'Dubai', 'Fixed monthly', 3000, null, 1, false, false, '971501234567', 'published', now(), now() + interval '30 days', 'Prepare coffee and serve guests warmly.'),
    (rid, 'Juice Maker', 'Juice Maker', 'Full-time', 'Sharjah', 'Sharjah', 'Negotiable', null, null, 1, true, true, '971501234567', 'published', now(), now() + interval '30 days', 'Prepare fresh juices and maintain the prep area.'),
    (rid, 'Restaurant Supervisor', 'Restaurant Supervisor', 'Full-time', 'Abu Dhabi', 'Abu Dhabi', 'Range', 4000, 5000, 1, false, false, '971501234567', 'published', now(), now() + interval '30 days', 'Lead daily service and support the restaurant team.');
end $$;
