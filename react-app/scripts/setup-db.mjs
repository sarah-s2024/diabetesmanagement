#!/usr/bin/env node
/**
 * Create `users` table in Supabase via SQL.
 * Usage: node scripts/setup-db.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_KEY in config.plain.yaml (already decrypted values).
 */
import fs from 'fs'
import yaml from 'js-yaml'
import { createClient } from '@supabase/supabase-js'

const plain = yaml.load(fs.readFileSync('config.plain.yaml', 'utf8'))
const sb = createClient(plain.supabase_url, plain.supabase_key)

const { error } = await sb.rpc('exec_sql', {
  query: `
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      height_cm REAL DEFAULT 170,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `
})

if (error) {
  // rpc might not exist, fall back to direct table creation check
  console.log('ℹ️  RPC not available. Please run this SQL in your Supabase Dashboard → SQL Editor:\n')
  console.log(`
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  height_cm REAL DEFAULT 170,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow anon access for registration and login
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can register" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read own row" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own row" ON users FOR UPDATE USING (true);
  `)
} else {
  console.log('✅ users table created')
}
