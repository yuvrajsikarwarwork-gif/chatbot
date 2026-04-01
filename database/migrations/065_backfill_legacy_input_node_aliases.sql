DO $$
DECLARE
  flow_row RECORD;
  flow_json JSONB;
  nodes JSONB;
  transformed_nodes JSONB;
  node_value JSONB;
  transformed_node JSONB;
  node_data JSONB;
  node_type TEXT;
  current_text TEXT;
  legacy_prompt_text TEXT;
  has_save_value BOOLEAN;
  lead_form_id TEXT;
  field_key TEXT;
  retries_text TEXT;
  timeout_text TEXT;
  reminder_delay_text TEXT;
  changed_count INTEGER := 0;
BEGIN
  FOR flow_row IN
    SELECT id, flow_json
    FROM flows
    ORDER BY created_at ASC
  LOOP
    flow_json := COALESCE(flow_row.flow_json, '{}'::jsonb);
    nodes := COALESCE(flow_json->'nodes', '[]'::jsonb);
    transformed_nodes := '[]'::jsonb;

    FOR node_value IN
      SELECT value
      FROM jsonb_array_elements(nodes) AS value
    LOOP
      transformed_node := node_value;
      node_type := LOWER(COALESCE(transformed_node->>'type', ''));
      node_data := COALESCE(transformed_node->'data', '{}'::jsonb);
      legacy_prompt_text := NULLIF(
        TRIM(
          COALESCE(
            node_data->>'prompt',
            node_data->>'question',
            node_data->>'text',
            node_data->>'questionLabel',
            ''
          )
        ),
        ''
      );
      has_save_value :=
        NULLIF(TRIM(COALESCE(node_data->>'value', node_data->>'output', '')), '') IS NOT NULL;

      IF node_type = 'lead_form' THEN
        transformed_node := jsonb_set(transformed_node, '{type}', to_jsonb('input'::text), true);
        node_type := 'input';
      END IF;

      IF node_type = 'save' AND legacy_prompt_text IS NOT NULL AND NOT has_save_value THEN
        transformed_node := jsonb_set(transformed_node, '{type}', to_jsonb('input'::text), true);
        node_type := 'input';
      END IF;

      IF node_type = 'input' THEN
        current_text := NULLIF(
          TRIM(
            COALESCE(
              legacy_prompt_text,
              ''
            )
          ),
          ''
        );
        IF current_text IS NOT NULL THEN
          node_data := jsonb_set(node_data, '{text}', to_jsonb(current_text), true);
          node_data := jsonb_set(node_data, '{prompt}', to_jsonb(current_text), true);
          node_data := jsonb_set(node_data, '{question}', to_jsonb(current_text), true);
        END IF;

        lead_form_id := NULLIF(
          TRIM(
            COALESCE(
              node_data->>'linkedFormId',
              node_data->>'leadFormId',
              node_data->>'formId',
              node_data->>'lead_form_id',
              ''
            )
          ),
          ''
        );

        field_key := NULLIF(
          TRIM(
            COALESCE(
              node_data->>'linkedFieldKey',
              node_data->>'leadField',
              node_data->>'field',
              ''
            )
          ),
          ''
        );

        IF LOWER(COALESCE(node_data->>'linkLeadForm', 'false')) IN ('true', '1', 'yes')
           OR lead_form_id IS NOT NULL
           OR field_key IS NOT NULL
        THEN
          node_data := jsonb_set(node_data, '{linkLeadForm}', 'true'::jsonb, true);

          IF lead_form_id IS NOT NULL THEN
            node_data := jsonb_set(node_data, '{linkedFormId}', to_jsonb(lead_form_id), true);
            node_data := jsonb_set(node_data, '{leadFormId}', to_jsonb(lead_form_id), true);
            node_data := jsonb_set(node_data, '{formId}', to_jsonb(lead_form_id), true);
            node_data := jsonb_set(node_data, '{lead_form_id}', to_jsonb(lead_form_id), true);
          END IF;

          IF field_key IS NOT NULL THEN
            node_data := jsonb_set(node_data, '{linkedFieldKey}', to_jsonb(field_key), true);
            node_data := jsonb_set(node_data, '{leadField}', to_jsonb(field_key), true);
            node_data := jsonb_set(node_data, '{field}', to_jsonb(field_key), true);
            IF NULLIF(TRIM(COALESCE(node_data->>'variable', '')), '') IS NULL THEN
              node_data := jsonb_set(node_data, '{variable}', to_jsonb(field_key), true);
            END IF;
          END IF;
        ELSE
          node_data := jsonb_set(node_data, '{linkLeadForm}', 'false'::jsonb, true);
        END IF;

        node_data := jsonb_set(
          node_data,
          '{validation}',
          to_jsonb(
            COALESCE(
              NULLIF(TRIM(COALESCE(node_data->>'validation', '')), ''),
              'text'
            )
          ),
          true
        );

        node_data := jsonb_set(
          node_data,
          '{onInvalidMessage}',
          to_jsonb(
            TRIM(
              COALESCE(
                node_data->>'onInvalidMessage',
                node_data->>'invalidMessage',
                ''
              )
            )
          ),
          true
        );

        retries_text := NULLIF(TRIM(COALESCE(node_data->>'maxRetries', '')), '');
        node_data := jsonb_set(
          node_data,
          '{maxRetries}',
          to_jsonb(CASE WHEN retries_text ~ '^[0-9]+$' THEN retries_text::int ELSE 3 END),
          true
        );

        timeout_text := NULLIF(TRIM(COALESCE(node_data->>'timeout', '')), '');
        node_data := jsonb_set(
          node_data,
          '{timeout}',
          to_jsonb(CASE WHEN timeout_text ~ '^[0-9]+$' THEN timeout_text::int ELSE 900 END),
          true
        );

        reminder_delay_text := NULLIF(TRIM(COALESCE(node_data->>'reminderDelay', '')), '');
        node_data := jsonb_set(
          node_data,
          '{reminderDelay}',
          to_jsonb(CASE WHEN reminder_delay_text ~ '^[0-9]+$' THEN reminder_delay_text::int ELSE 300 END),
          true
        );

        node_data := jsonb_set(
          node_data,
          '{reminderText}',
          to_jsonb(TRIM(COALESCE(node_data->>'reminderText', ''))),
          true
        );

        node_data := jsonb_set(
          node_data,
          '{timeoutFallback}',
          to_jsonb(TRIM(COALESCE(node_data->>'timeoutFallback', ''))),
          true
        );

        transformed_node := jsonb_set(transformed_node, '{data}', node_data, true);
      END IF;

      transformed_nodes := transformed_nodes || jsonb_build_array(transformed_node);
    END LOOP;

    IF transformed_nodes IS DISTINCT FROM nodes THEN
      UPDATE flows
      SET flow_json = jsonb_set(flow_json, '{nodes}', transformed_nodes, true),
          updated_at = NOW()
      WHERE id = flow_row.id;

      DELETE FROM flow_nodes WHERE flow_id = flow_row.id;
      INSERT INTO flow_nodes (flow_id, node_id, node_type, node_label, node_data, position_x, position_y)
      SELECT
        flow_row.id,
        node_json->>'id',
        node_json->>'type',
        NULLIF(TRIM(COALESCE(node_json->'data'->>'label', node_json->'data'->>'text', '')), ''),
        COALESCE(node_json->'data', '{}'::jsonb),
        CASE
          WHEN COALESCE(node_json->'position'->>'x', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (node_json->'position'->>'x')::double precision
          ELSE NULL
        END,
        CASE
          WHEN COALESCE(node_json->'position'->>'y', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (node_json->'position'->>'y')::double precision
          ELSE NULL
        END
      FROM jsonb_array_elements(transformed_nodes) AS node(node_json);

      changed_count := changed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfilled legacy input node aliases in % flow(s).', changed_count;
END $$;
