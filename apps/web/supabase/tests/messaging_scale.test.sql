BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '71000000-0000-4000-8000-000000000001',
    'scale-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"scale_buyer"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'scale-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"scale_seller"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    'scale-outsider@example.test',
    'authenticated',
    'authenticated',
    '{"username":"scale_outsider"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'Dracaufeu pagination',
    100,
    'ACTIVE'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Pikachu pagination',
    30,
    'ACTIVE'
  );

INSERT INTO public.conversations (
  id, listing_id, buyer_id, seller_id, created_at
)
VALUES
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    '2026-01-01T00:00:00Z'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    '2026-01-02T00:00:00Z'
  );

INSERT INTO public.messages (
  id, conversation_id, sender_id, content, message_type, created_at
)
VALUES
  (
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'Premier message',
    'text',
    '2026-01-03T00:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Deuxième message',
    'text',
    '2026-01-04T00:00:00Z'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*) FROM public.get_inbox(NULL, NULL, NULL, 1, NULL, false)),
  1::bigint,
  'get_inbox enforces the requested page size'
);

SELECT is(
  (
    WITH first_page AS (
      SELECT sort_at, id
      FROM public.get_inbox(NULL, NULL, NULL, 1, NULL, false)
    )
    SELECT page.id
    FROM first_page
    CROSS JOIN LATERAL public.get_inbox(
      NULL, first_page.sort_at, first_page.id, 10, NULL, false
    ) AS page
    LIMIT 1
  ),
  '73000000-0000-4000-8000-000000000001'::uuid,
  'get_inbox continues after a stable keyset cursor'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.get_inbox(NULL, NULL, NULL, 10, 'Dracaufeu', false)
  ),
  1::bigint,
  'get_inbox searches listing titles'
);

SELECT lives_ok(
  $$
    INSERT INTO public.conversation_participant_settings (
      conversation_id, user_id, archived_at, muted_until
    )
    VALUES (
      '73000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      now(),
      now() + interval '1 day'
    )
  $$,
  'a participant can archive and mute their conversation'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.get_inbox(NULL, NULL, NULL, 10, NULL, true)
  ),
  1::bigint,
  'archived inbox only returns archived conversations'
);

SELECT throws_ok(
  $$
    INSERT INTO public.conversation_participant_settings (
      conversation_id, user_id, archived_at
    )
    VALUES (
      '73000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000003',
      now()
    )
  $$,
  '42501',
  NULL,
  'an outsider cannot change participant settings'
);

SELECT lives_ok(
  $$
    INSERT INTO public.conversation_reports (
      reporter_id, conversation_id, message_id, reason, description
    )
    VALUES (
      '71000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      'spam',
      'Ce message est indésirable.'
    )
  $$,
  'a participant can report a message'
);

SELECT ok(
  (
    SELECT message_snapshot ->> 'content' = 'Premier message'
    FROM public.conversation_reports
    WHERE message_id = '74000000-0000-4000-8000-000000000001'
  ),
  'the database captures an immutable message snapshot'
);

SELECT lives_ok(
  $$
    INSERT INTO public.user_blocks (blocker_id, blocked_id)
    VALUES (
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002'
    )
  $$,
  'a user can block another user'
);

SELECT throws_ok(
  $$
    INSERT INTO public.messages (
      conversation_id, sender_id, content, message_type
    )
    VALUES (
      '73000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      'Ce message doit être refusé',
      'text'
    )
  $$,
  '42501',
  NULL,
  'a block in either direction prevents new messages'
);

SELECT * FROM finish();
ROLLBACK;
