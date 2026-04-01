DO $$
DECLARE
  bot_row RECORD;
  current_settings JSONB;
  resolved_handoff_flow_id TEXT;
  resolved_csat_flow_id TEXT;
  fallback_message TEXT;
  opt_out_message TEXT;
  keyword_interrupts JSONB;
  system_messages JSONB;
  system_flows JSONB;
  next_settings JSONB;
BEGIN
  FOR bot_row IN
    SELECT id, settings, settings_json, global_settings
    FROM bots
    WHERE deleted_at IS NULL
  LOOP
    current_settings :=
      COALESCE(bot_row.settings, '{}'::jsonb)
      || COALESCE(bot_row.settings_json, '{}'::jsonb)
      || COALESCE(bot_row.global_settings, '{}'::jsonb);

    SELECT f.id::text
    INTO resolved_handoff_flow_id
    FROM flows f
    WHERE f.bot_id = bot_row.id
      AND (
        COALESCE(f.is_system_flow, false) = true
        OR COALESCE((f.flow_json->>'is_system_flow')::boolean, false) = true
        OR COALESCE((f.flow_json->>'is_global_flow')::boolean, false) = true
        OR LOWER(COALESCE(f.flow_name, '')) LIKE '%handoff%'
      )
      AND (
        LOWER(COALESCE(f.flow_name, '')) LIKE '%handoff%'
        OR LOWER(COALESCE(f.flow_json->>'system_flow_type', '')) = 'handoff'
      )
    ORDER BY COALESCE(f.is_default, false) DESC, f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST, f.id DESC
    LIMIT 1;

    SELECT f.id::text
    INTO resolved_csat_flow_id
    FROM flows f
    WHERE f.bot_id = bot_row.id
      AND (
        COALESCE(f.is_system_flow, false) = true
        OR COALESCE((f.flow_json->>'is_system_flow')::boolean, false) = true
        OR COALESCE((f.flow_json->>'is_global_flow')::boolean, false) = true
        OR LOWER(COALESCE(f.flow_name, '')) LIKE '%csat%'
      )
      AND (
        LOWER(COALESCE(f.flow_name, '')) LIKE '%csat%'
        OR LOWER(COALESCE(f.flow_json->>'system_flow_type', '')) = 'csat'
      )
    ORDER BY COALESCE(f.is_default, false) DESC, f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST, f.id DESC
    LIMIT 1;

    fallback_message :=
      COALESCE(
        NULLIF(TRIM(COALESCE(current_settings->'system_messages'->>'fallback_message', '')), ''),
        NULLIF(TRIM(COALESCE(current_settings->>'fallback_message', '')), ''),
        'I didn''t quite understand that. Can you rephrase?'
      );

    opt_out_message :=
      COALESCE(
        NULLIF(TRIM(COALESCE(current_settings->'system_messages'->>'opt_out_message', '')), ''),
        NULLIF(TRIM(COALESCE(current_settings->>'opt_out_message', '')), ''),
        'You have been unsubscribed and will no longer receive messages.'
      );

    keyword_interrupts :=
      CASE
        WHEN jsonb_typeof(current_settings->'keyword_interrupts') = 'array' THEN current_settings->'keyword_interrupts'
        WHEN jsonb_typeof(current_settings->'universal_rules') = 'array' THEN current_settings->'universal_rules'
        ELSE '[]'::jsonb
      END;

    system_messages :=
      COALESCE(current_settings->'system_messages', '{}'::jsonb)
      || jsonb_build_object(
        'fallback_message', fallback_message,
        'opt_out_message', opt_out_message
      );

    system_flows :=
      COALESCE(current_settings->'system_flows', '{}'::jsonb)
      || jsonb_build_object(
        'handoff_flow_id',
          COALESCE(
            NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_flow_id', '')), ''),
            NULLIF(TRIM(COALESCE(current_settings->>'handoff_flow_id', '')), ''),
            resolved_handoff_flow_id
          ),
        'csat_flow_id',
          COALESCE(
            NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_flow_id', '')), ''),
            NULLIF(TRIM(COALESCE(current_settings->>'csat_flow_id', '')), ''),
            resolved_csat_flow_id
          ),
        'handoff_mode',
          CASE
            WHEN COALESCE(
              NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_flow_id', '')), ''),
              NULLIF(TRIM(COALESCE(current_settings->>'handoff_flow_id', '')), ''),
              resolved_handoff_flow_id
            ) IS NOT NULL
            THEN COALESCE(NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_mode', '')), ''), NULLIF(TRIM(COALESCE(current_settings->>'handoff_mode', '')), ''), 'default')
            ELSE 'disabled'
          END,
        'csat_mode',
          CASE
            WHEN COALESCE(
              NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_flow_id', '')), ''),
              NULLIF(TRIM(COALESCE(current_settings->>'csat_flow_id', '')), ''),
              resolved_csat_flow_id
            ) IS NOT NULL
            THEN COALESCE(NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_mode', '')), ''), NULLIF(TRIM(COALESCE(current_settings->>'csat_mode', '')), ''), 'default')
            ELSE 'disabled'
          END
      );

    next_settings :=
      current_settings
      || jsonb_build_object(
        'system_messages', system_messages,
        'system_flows', system_flows,
        'keyword_interrupts', keyword_interrupts,
        'universal_rules', keyword_interrupts,
        'fallback_message', fallback_message,
        'opt_out_message', opt_out_message,
        'handoff_flow_id',
          COALESCE(
            NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_flow_id', '')), ''),
            NULLIF(TRIM(COALESCE(current_settings->>'handoff_flow_id', '')), ''),
            resolved_handoff_flow_id
          ),
        'csat_flow_id',
          COALESCE(
            NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_flow_id', '')), ''),
            NULLIF(TRIM(COALESCE(current_settings->>'csat_flow_id', '')), ''),
            resolved_csat_flow_id
          ),
        'handoff_mode',
          CASE
            WHEN COALESCE(
              NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_flow_id', '')), ''),
              NULLIF(TRIM(COALESCE(current_settings->>'handoff_flow_id', '')), ''),
              resolved_handoff_flow_id
            ) IS NOT NULL
            THEN COALESCE(NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'handoff_mode', '')), ''), NULLIF(TRIM(COALESCE(current_settings->>'handoff_mode', '')), ''), 'default')
            ELSE 'disabled'
          END,
        'csat_mode',
          CASE
            WHEN COALESCE(
              NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_flow_id', '')), ''),
              NULLIF(TRIM(COALESCE(current_settings->>'csat_flow_id', '')), ''),
              resolved_csat_flow_id
            ) IS NOT NULL
            THEN COALESCE(NULLIF(TRIM(COALESCE(current_settings->'system_flows'->>'csat_mode', '')), ''), NULLIF(TRIM(COALESCE(current_settings->>'csat_mode', '')), ''), 'default')
            ELSE 'disabled'
          END
      );

    UPDATE bots
    SET settings = next_settings,
        settings_json = next_settings,
        global_settings = next_settings,
        updated_at = NOW()
    WHERE id = bot_row.id;
  END LOOP;
END $$;
