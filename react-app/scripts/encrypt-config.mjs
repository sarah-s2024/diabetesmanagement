#!/usr/bin/env node
/**
 * Encrypt plaintext config values into public/config.yaml
 * Usage: node scripts/encrypt-config.mjs
 *
 * Mode 1 (local): Reads from config.plain.yaml + .env
 * Mode 2 (CI/Netlify): Reads from environment variables directly
 *
 * Environment variables (for CI):
 *   VITE_SECRET_KEY, SUPABASE_URL, SUPABASE_KEY,
 *   CLAUDE_KEY, OPENROUTER_KEY, APP_PASSWORD, HEIGHT_CM
 */
import fs from 'fs'
import yaml from 'js-yaml'
import CryptoJS from 'crypto-js'
import { config } from 'dotenv'

config() // load .env if present
const SECRET = process.env.VITE_SECRET_KEY
if (!SECRET || SECRET === 'change-me-to-a-random-string') {
  console.error('❌ Please set VITE_SECRET_KEY in .env or as environment variable')
  process.exit(1)
}

let plain

const plainPath = 'config.plain.yaml'
if (fs.existsSync(plainPath)) {
  // Local mode: read from yaml file
  plain = yaml.load(fs.readFileSync(plainPath, 'utf8'))
  console.log('📄 Read config from config.plain.yaml')
} else {
  // CI mode: read from environment variables
  plain = {
    supabase_url: process.env.SUPABASE_URL || '',
    supabase_key: process.env.SUPABASE_KEY || '',
    claude_key: process.env.CLAUDE_KEY || '',
    openrouter_key: process.env.OPENROUTER_KEY || '',
    app_password: process.env.APP_PASSWORD || '',
    height_cm: parseInt(process.env.HEIGHT_CM || '170', 10),
  }
  console.log('🔧 Read config from environment variables (CI mode)')
}

const encrypted = {}
for (const [k, v] of Object.entries(plain)) {
  encrypted[k] = CryptoJS.AES.encrypt(String(v), SECRET).toString()
}

fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/config.yaml', yaml.dump(encrypted))
console.log('✅ Encrypted config written to public/config.yaml')
