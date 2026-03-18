'use strict';

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — DB features disabled');
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_KEY || 'placeholder',
  { auth: { persistSession: false } }
);

module.exports = supabase;
