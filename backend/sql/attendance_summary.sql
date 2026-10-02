-- Subject-wise attendance aggregation for the institutional report.
-- Mirrors frontend/src/report-engine/compute.ts; both are tested against the same fixture.
--
--   select * from attendance_summary('T1', '2026-06-29', '2026-09-30');
--   select * from attendance_early_departures('T1', '2026-06-29', '2026-09-30');
--
-- Rules
--   * One timetable row = one hour; rows of one block share block_start (a 2h lab = two rows).
--   * Units (match the reference sheet): practical counts once per lab SESSION, mini-project per
--     hour; pass 'hour' to count every hour. Theory is always per hour.
--   * "Lect. Engaged" is lectures actually conducted: rows in cancelled_sessions (batch, date,
--     block_start) are removed from both engaged and attended.
--   * Morning hours (start < 13:00) are credited when slot 1 is within 08:30-09:00.
--   * Afternoon hours are credited when slot 2 is within 13:45-14:15.
--   * Slot 3 (17:00-17:30) never removes hours; a missing/invalid one after a valid check-in,
--     without permission, is reported by attendance_early_departures().
--   * Weekends and academic_holidays are not working days. Remedial rows are ignored.

create table if not exists timetable_slots (
  id         bigserial primary key,
  batch_id   text     not null,
  weekday    smallint not null check (weekday between 1 and 5),   -- ISO Mon..Fri
  start_time time     not null,
  end_time   time     not null,
  block_start time    not null,
  subject    text     not null,
  kind       text     not null check (kind in ('theory', 'practical', 'miniproj', 'remedial')),
  check (end_time > start_time)
);
create index if not exists timetable_slots_batch_day on timetable_slots (batch_id, weekday);

create table if not exists cancelled_sessions (
  batch_id     text not null,
  session_date date not null,
  block_start  time not null,
  primary key (batch_id, session_date, block_start)
);

create table if not exists academic_holidays (
  holiday_date date primary key,
  description  text
);

-- Raw daily biometric record, one row per student per day (built from attendance scans).
create table if not exists biometric_day_logs (
  student_id                bigint not null,
  log_date                  date   not null,
  slot_1_time               time,
  slot_2_time               time,
  slot_3_time               time,
  early_departure_permitted boolean not null default false,
  primary key (student_id, log_date)
);

-- students must expose: id, roll_no, name, batch_id, guardian_phone (add batch_id/roll_no if absent).

create or replace function attendance_summary(
  p_batch text, p_start date, p_end date,
  p_practical_unit text default 'session', p_miniproj_unit text default 'hour')
returns table (
  student_id   bigint,
  roll_no      int,
  student_name text,
  grp          text,      -- 'theory' (incl. mini-project) | 'practical'
  subject      text,
  attended     int,
  engaged      int
)
language sql stable as $$
  with working_days as (
    select d::date as day, extract(isodow from d)::int as dow
    from generate_series(p_start, p_end, interval '1 day') d
    where extract(isodow from d) between 1 and 5
      and not exists (select 1 from academic_holidays h where h.holiday_date = d::date)
  ),
  sessions as (
    select w.day,
           t.subject,
           case when t.kind = 'practical' then 'practical' else 'theory' end as grp,
           (t.start_time < time '13:00') as morning
    from working_days w
    join timetable_slots t on t.batch_id = p_batch and t.weekday = w.dow
    where t.kind in ('theory', 'practical', 'miniproj')
      and not exists (select 1 from cancelled_sessions c
                      where c.batch_id = p_batch and c.session_date = w.day and c.block_start = t.block_start)
      and (case t.kind
             when 'practical' then p_practical_unit = 'hour' or t.start_time = t.block_start
             when 'miniproj'  then p_miniproj_unit  = 'hour' or t.start_time = t.block_start
             else true end)
  ),
  studs as (
    select s.id, s.roll_no, s.name from students s where s.batch_id = p_batch
  ),
  checks as (
    select dl.student_id, dl.log_date,
           coalesce(dl.slot_1_time between time '08:30' and time '09:00', false) as s1,
           coalesce(dl.slot_2_time between time '13:45' and time '14:15', false) as s2
    from biometric_day_logs dl
    where dl.log_date between p_start and p_end
  ),
  engaged as (
    select grp, subject, count(*)::int as n from sessions group by grp, subject
  ),
  attended as (
    select st.id, se.grp, se.subject,
           count(*) filter (where (se.morning and c.s1) or (not se.morning and c.s2))::int as n
    from studs st
    cross join sessions se
    left join checks c on c.student_id = st.id and c.log_date = se.day
    group by st.id, se.grp, se.subject
  )
  select st.id, st.roll_no, st.name, e.grp, e.subject, coalesce(a.n, 0), e.n
  from studs st
  cross join engaged e
  left join attended a on a.id = st.id and a.grp = e.grp and a.subject = e.subject
  order by st.roll_no, e.grp desc, e.subject;
$$;

create or replace function attendance_early_departures(p_batch text, p_start date, p_end date)
returns table (student_id bigint, log_date date)
language sql stable as $$
  select dl.student_id, dl.log_date
  from biometric_day_logs dl
  join students s on s.id = dl.student_id and s.batch_id = p_batch
  where dl.log_date between p_start and p_end
    and extract(isodow from dl.log_date) between 1 and 5
    and not exists (select 1 from academic_holidays h where h.holiday_date = dl.log_date)
    and (coalesce(dl.slot_1_time between time '08:30' and time '09:00', false)
         or coalesce(dl.slot_2_time between time '13:45' and time '14:15', false))
    and not coalesce(dl.slot_3_time between time '17:00' and time '17:30', false)
    and not dl.early_departure_permitted
  order by dl.student_id, dl.log_date;
$$;
