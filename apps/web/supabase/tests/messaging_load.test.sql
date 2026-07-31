BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);
CREATE TEMP TABLE messaging_load_metrics (
  scenario text PRIMARY KEY,
  duration_ms numeric NOT NULL,
  rows_processed bigint NOT NULL
);
GRANT SELECT, INSERT ON messaging_load_metrics TO authenticated;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '81000000-0000-4000-8000-000000000001',
    'load-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"load_buyer"}'::jsonb
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'load-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"load_seller"}'::jsonb
  );

INSERT INTO public.listings (
  id, seller_id, title, price_seller, status, created_at
)
SELECT
  gen_random_uuid(),
  '81000000-0000-4000-8000-000000000002',
  'Load card ' || series,
  10 + (series % 100),
  'ACTIVE',
  now() - make_interval(secs => series)
FROM generate_series(1, 2000) AS series;

INSERT INTO public.conversations (
  id, listing_id, buyer_id, seller_id, created_at
)
SELECT
  gen_random_uuid(),
  listings.id,
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002',
  listings.created_at
FROM public.listings
WHERE seller_id = '81000000-0000-4000-8000-000000000002'
  AND title LIKE 'Load card %';

INSERT INTO public.messages (
  conversation_id, sender_id, content, message_type, metadata
)
SELECT
  conversations.id,
  CASE WHEN message_number % 2 = 0
    THEN conversations.buyer_id
    ELSE conversations.seller_id
  END,
  'Load message ' || message_number,
  'text',
  jsonb_build_object(
    'client_id',
    conversations.id::text || '-' || message_number
  )
FROM public.conversations
CROSS JOIN generate_series(1, 20) AS message_number
WHERE buyer_id = '81000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

DO $$
DECLARE
  started_at timestamptz := clock_timestamp();
  row_count bigint;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.get_inbox(NULL, NULL, NULL, 30, NULL, false);
  INSERT INTO messaging_load_metrics
  VALUES (
    'inbox_first_page',
    extract(milliseconds FROM clock_timestamp() - started_at),
    row_count
  );
END;
$$;

DO $$
DECLARE
  started_at timestamptz := clock_timestamp();
  row_count bigint;
  target_conversation uuid;
BEGIN
  SELECT id INTO target_conversation
  FROM public.conversations
  WHERE buyer_id = '81000000-0000-4000-8000-000000000001'
  LIMIT 1;

  SELECT count(*) INTO row_count
  FROM (
    SELECT id
    FROM public.messages
    WHERE conversation_id = target_conversation
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  ) AS history_page;

  INSERT INTO messaging_load_metrics
  VALUES (
    'history_first_page',
    extract(milliseconds FROM clock_timestamp() - started_at),
    row_count
  );
END;
$$;

DO $$
DECLARE
  started_at timestamptz := clock_timestamp();
  row_count bigint;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.messages
  WHERE read_at IS NULL
    AND sender_id <> '81000000-0000-4000-8000-000000000001';
  INSERT INTO messaging_load_metrics
  VALUES (
    'global_unread_count',
    extract(milliseconds FROM clock_timestamp() - started_at),
    row_count
  );
END;
$$;

SET LOCAL ROLE postgres;
DO $$
DECLARE
  started_at timestamptz := clock_timestamp();
  target_conversation public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO target_conversation
  FROM public.conversations
  WHERE buyer_id = '81000000-0000-4000-8000-000000000001'
  LIMIT 1;

  INSERT INTO public.messages (
    conversation_id, sender_id, content, message_type, metadata
  )
  SELECT
    target_conversation.id,
    target_conversation.seller_id,
    'Realtime burst ' || series,
    'text',
    jsonb_build_object('client_id', 'burst-' || series)
  FROM generate_series(1, 1000) AS series;

  INSERT INTO messaging_load_metrics
  VALUES (
    'realtime_write_burst',
    extract(milliseconds FROM clock_timestamp() - started_at),
    1000
  );
END;
$$;

SELECT ok(
  duration_ms < 3000,
  scenario || ' processed ' || rows_processed || ' rows in '
    || round(duration_ms, 2) || 'ms'
)
FROM messaging_load_metrics
ORDER BY scenario;

SELECT * FROM finish();
ROLLBACK;
