-- Migration: Create user data permissions table
-- This table stores what data each user is authorized to access
-- Used for filtering DuckDB/StarRocks queries by user scope

CREATE TABLE IF NOT EXISTS user_data_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Allowed accounts (e.g., employee account IDs)
  allowed_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Allowed departments
  allowed_departments TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Allowed regions
  allowed_regions TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on permissions table
ALTER TABLE user_data_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own permissions
CREATE POLICY "Users can access their own permissions"
ON user_data_permissions
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_data_permissions_user_id ON user_data_permissions(user_id);

-- Add updated_at trigger
CREATE TRIGGER update_user_data_permissions_updated_at
  BEFORE UPDATE ON user_data_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to get user's data scope
-- This function can be called from application code to get user permissions
CREATE OR REPLACE FUNCTION get_user_data_scope(p_user_id UUID)
RETURNS TABLE (
  allowed_accounts TEXT[],
  allowed_departments TEXT[],
  allowed_regions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(udp.allowed_accounts, ARRAY[]::TEXT[]) as allowed_accounts,
    COALESCE(udp.allowed_departments, ARRAY[]::TEXT[]) as allowed_departments,
    COALESCE(udp.allowed_regions, ARRAY[]::TEXT[]) as allowed_regions
  FROM user_data_permissions udp
  WHERE udp.user_id = p_user_id;
  
  -- If no permissions found, return empty arrays (fail-secure)
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      ARRAY[]::TEXT[] as allowed_accounts,
      ARRAY[]::TEXT[] as allowed_departments,
      ARRAY[]::TEXT[] as allowed_regions;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

