-- Migration: Add PGMQ queue for Feishu task link retries
-- Requires pgmq extension to be installed on Postgres

CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create queue for Feishu task → GitLab link retries
SELECT pgmq.create('feishu_task_link');

-- Enqueue task link job
CREATE OR REPLACE FUNCTION public.enqueue_feishu_task_link(payload JSONB)
RETURNS BIGINT
LANGUAGE SQL
AS $$
  SELECT pgmq.send('feishu_task_link', payload);
$$;

-- Dequeue task link jobs
CREATE OR REPLACE FUNCTION public.dequeue_feishu_task_link(
  batch_size INTEGER DEFAULT 5,
  visibility_timeout INTEGER DEFAULT 60
)
RETURNS TABLE(
  msg_id BIGINT,
  read_ct INTEGER,
  enqueued_at TIMESTAMPTZ,
  message JSONB
)
LANGUAGE SQL
AS $$
  SELECT msg_id, read_ct, enqueued_at, message
  FROM pgmq.read('feishu_task_link', visibility_timeout, batch_size);
$$;

-- Ack (delete) job after success
CREATE OR REPLACE FUNCTION public.ack_feishu_task_link(msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE SQL
AS $$
  SELECT pgmq.delete('feishu_task_link', msg_id);
$$;
