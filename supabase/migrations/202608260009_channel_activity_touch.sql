-- Sidebar redesign: channels must sort by last activity ("latest ones on top"), not
-- creation time. Same signature as before (only the body changes), so a plain
-- create-or-replace is enough — no drop-and-recreate needed since no parameter changed.
create or replace function public.create_pending_work_order(p_command text, p_context_pack jsonb, p_channel_id uuid default null)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  insert into public.work_orders (command, status, context_pack, created_by_profile_id, channel_id)
  values (p_command, 'queued', p_context_pack, public.current_profile_id(), p_channel_id)
  returning id into v_id;

  if p_channel_id is not null then
    update public.chat_channels set updated_at = now() where id = p_channel_id;
  end if;

  return v_id;
end;
$$;
