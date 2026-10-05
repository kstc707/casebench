-- Each proactive agent message (a "trigger") may be posted at most once per
-- run. The app checks this too, but two requests arriving at the same moment
-- (e.g. two polls) could both decide a trigger is due; this index makes the
-- second insert fail instead of posting a duplicate message.
create unique index if not exists run_events_trigger_once
  on run_events (run_id, (payload ->> 'trigger'))
  where event_type = 'message_received' and payload ->> 'trigger' is not null;

-- Public portfolio pages look runs up by id without a user filter, but only
-- published runs are ever shown (enforced in the query).
create index if not exists runs_status_idx on runs (status);
