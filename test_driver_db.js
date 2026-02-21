const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_DRIVER_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_DRIVER_ANON_KEY;
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('delivery_routes').select('*').limit(1);
  console.log("delivery_routes:", { data: data ? data.length : 0, error });

  // also check what tables might exist by forcing an error or querying a common table
  const { data: b, error: err } = await supabase.from('modified_drops').select('*').limit(1);
  console.log("modified_drops:", { data: b, error: err });
}
check();
