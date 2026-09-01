BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'messaging-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"messaging_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'messaging-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"messaging_seller"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    'messaging-outsider@example.test',
    'authenticated',
    'authenticated',
    '{"username":"messaging_outsider"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'Messaging card one',
    20,
    'LOCKED'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    'Messaging card two',
    30,
    'LOCKED'
  ),
  (
    '62000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000003',
    'Outsider card',
    40,
    'LOCKED'
  );

INSERT INTO public.conversations (id, listing_id, buyer_id, seller_id)
VALUES
  (
    '63000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002'
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002'
  ),
  (
    '63000000-0000-4000-8000-000000000003',
    '62000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000003'
  );

INSERT INTO public.transactions (
  id,
  listing_id,
  buyer_id,
  seller_id,
  total_amount,
  fee_amount,
  shipping_cost,
  status
)
VALUES (
  '64000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  25,
  2,
  3,
  'PAID'
);

INSERT INTO public.offers (
  id,
  listing_id,
  buyer_id,
  offer_amount,
  status,
  conversation_id
)
VALUES (
  '66000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  18,
  'PENDING',
  '63000000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $$
    INSERT INTO public.messages (
      id, conversation_id, sender_id, content, message_type, created_at
    )
    VALUES (
      '65000000-0000-4000-8000-000000000001',
      '63000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      'Message légitime',
      'text',
      '2099-01-01T00:00:00Z'
    )
  $$,
  'a participant can insert a text message'
);

SELECT ok(
  (
    SELECT created_at < '2099-01-01T00:00:00Z'::timestamptz
    FROM public.messages
    WHERE id = '65000000-0000-4000-8000-000000000001'
  ),
  'the database replaces a client-created timestamp'
);

SELECT throws_ok(
  $$
    INSERT INTO public.messages (
      conversation_id, sender_id, content, message_type
    )
    VALUES (
      '63000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      'Paiement falsifié',
      'payment_completed'
    )
  $$,
  '42501',
  NULL,
  'an authenticated participant cannot forge payment_completed'
);

SELECT throws_ok(
  $$
    INSERT INTO public.messages (
      conversation_id, sender_id, content, message_type, read_at
    )
    VALUES (
      '63000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      'Déjà lu',
      'text',
      now()
    )
  $$,
  '42501',
  NULL,
  'an authenticated sender cannot forge a read receipt on insert'
);

SELECT throws_ok(
  $$
    INSERT INTO public.messages (
      conversation_id, sender_id, content, message_type
    )
    VALUES (
      '63000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000002',
      'Faux expéditeur',
      'text'
    )
  $$,
  '42501',
  NULL,
  'an authenticated user cannot forge the sender id'
);

SELECT throws_ok(
  $$
    SELECT public.upsert_conversation(
      '62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  NULL,
  'upsert_conversation rejects a forged buyer id'
);

SELECT throws_ok(
  $$
    INSERT INTO public.conversations (listing_id, buyer_id, seller_id)
    VALUES (
      '62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003',
      '61000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  NULL,
  'a buyer cannot forge a conversation naming themselves as the seller'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    INSERT INTO public.conversations (listing_id, buyer_id, seller_id)
    VALUES (
      '62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003',
      '61000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  NULL,
  'a seller cannot forge a conversation for an arbitrary buyer'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    INSERT INTO public.offers (
      listing_id, buyer_id, offer_amount, status, conversation_id
    )
    VALUES (
      '62000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000001',
      19,
      'PENDING',
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  NULL,
  'authenticated clients cannot bypass the server offer creation route'
);

SELECT is_empty(
  $$
    UPDATE public.offers
    SET status = 'ACCEPTED',
        conversation_id = '63000000-0000-4000-8000-000000000002'
    WHERE id = '66000000-0000-4000-8000-000000000001'
    RETURNING id
  $$,
  'authenticated clients cannot rewrite offer state or conversation'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT is_empty(
  $$
    UPDATE public.offers
    SET status = 'ACCEPTED',
        buyer_id = '61000000-0000-4000-8000-000000000003'
    WHERE id = '66000000-0000-4000-8000-000000000001'
    RETURNING id
  $$,
  'authenticated sellers cannot rewrite offer state or buyer'
);

SELECT throws_ok(
  $$
    UPDATE public.messages
    SET content = 'Contenu falsifié', read_at = now()
    WHERE id = '65000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'a recipient cannot alter message content while marking it read'
);

SELECT lives_ok(
  $$
    UPDATE public.messages
    SET read_at = '2099-01-01T00:00:00Z'
    WHERE id = '65000000-0000-4000-8000-000000000001'
  $$,
  'the recipient can mark a message as read'
);

SELECT is(
  (
    SELECT content
    FROM public.messages
    WHERE id = '65000000-0000-4000-8000-000000000001'
  ),
  'Message légitime',
  'the original message content remains immutable'
);

SELECT ok(
  (
    SELECT read_at < '2099-01-01T00:00:00Z'::timestamptz
    FROM public.messages
    WHERE id = '65000000-0000-4000-8000-000000000001'
  ),
  'the database replaces a client timestamp with its own timestamp'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is_empty(
  $$
    UPDATE public.messages
    SET read_at = now()
    WHERE id = '65000000-0000-4000-8000-000000000001'
    RETURNING id
  $$,
  'a sender cannot mark their own message as read'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT is_empty(
  $$
    UPDATE public.messages
    SET read_at = now()
    WHERE id = '65000000-0000-4000-8000-000000000001'
    RETURNING id
  $$,
  'a user outside the conversation cannot mark a message as read'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (
    SELECT count(*)
    FROM public.get_inbox('61000000-0000-4000-8000-000000000002')
  ),
  2::bigint,
  'get_inbox returns the authenticated user conversations'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.get_inbox('61000000-0000-4000-8000-000000000002')
    WHERE id = '63000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'get_inbox ignores a forged user argument'
);

SELECT throws_ok(
  $$
    SELECT public.ship_order(
      '64000000-0000-4000-8000-000000000001',
      'TRACK-001',
      NULL,
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  NULL,
  'ship_order rejects a non-seller'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.ship_order(
      '64000000-0000-4000-8000-000000000001',
      'TRACK-001',
      NULL,
      '63000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  NULL,
  'ship_order rejects a conversation from another listing'
);

SELECT is(
  (
    SELECT status
    FROM public.transactions
    WHERE id = '64000000-0000-4000-8000-000000000001'
  ),
  'PAID',
  'a rejected shipping RPC leaves the transaction unchanged'
);

SELECT lives_ok(
  $$
    SELECT public.ship_order(
      '64000000-0000-4000-8000-000000000001',
      'TRACK-001',
      NULL,
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  'ship_order inserts its correlated system message atomically'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.messages
    WHERE conversation_id = '63000000-0000-4000-8000-000000000001'
      AND message_type = 'order_shipped'
  ),
  1::bigint,
  'ship_order is authorized to create the reserved system type'
);

SELECT throws_ok(
  $$
    SELECT public.create_dispute(
      '64000000-0000-4000-8000-000000000001',
      'other',
      'Description suffisamment longue',
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  NULL,
  'create_dispute rejects a non-buyer'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    SELECT public.create_dispute(
      '64000000-0000-4000-8000-000000000001',
      'other',
      'Description suffisamment longue',
      '63000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  NULL,
  'create_dispute rejects a conversation from another listing'
);

SELECT is(
  (
    SELECT status
    FROM public.transactions
    WHERE id = '64000000-0000-4000-8000-000000000001'
  ),
  'SHIPPED',
  'a rejected dispute RPC leaves the transaction unchanged'
);

SELECT lives_ok(
  $$
    SELECT public.create_dispute(
      '64000000-0000-4000-8000-000000000001',
      'other',
      'Description suffisamment longue',
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  'create_dispute inserts its correlated system message atomically'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.messages
    WHERE conversation_id = '63000000-0000-4000-8000-000000000001'
      AND message_type = 'dispute_opened'
  ),
  1::bigint,
  'create_dispute creates exactly one correlated system message'
);

SELECT * FROM finish();
ROLLBACK;
