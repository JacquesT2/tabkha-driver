import { supabaseDriver } from './lib/services/supabase-driver';
import { supabase } from './lib/services/supabase';

async function runTest() {
    console.log('1. Loading an order from the main database...');
    const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('id, delivery_date')
        .limit(1);

    if (oErr || !orders || orders.length === 0) {
        console.error('Failed to load an order:', oErr);
        return;
    }

    const order = orders[0];
    console.log(`Testing with order: ${order.id} on date ${order.delivery_date}`);

    console.log('\n2. Creating a modification in the Driver database...');
    const modification = {
        order_id: order.id,
        original_delivery_date: order.delivery_date,
        new_delivery_date: order.delivery_date, // Same day for test
        new_delivery_window_start: "18:00",
        new_delivery_window_end: "19:00",
        status: 'rescheduled',
        notes: 'Test modification via script'
    };

    const { error: insertErr } = await supabaseDriver
        .from('modified_drops')
        .upsert({ ...modification, updated_at: new Date().toISOString() }, { onConflict: 'order_id' }); // NOTE: The table has ID as PK, but we'll try to insert

    if (insertErr) {
        console.error('Failed to insert modification:', insertErr);
        console.log('Ensure you ran the SQL to create the modified_drops table in the Driver Project!');
        return;
    }

    console.log('Modification inserted successfully.');

    console.log('\n3. Cleaning up test data...');
    const { error: delErr } = await supabaseDriver
        .from('modified_drops')
        .delete()
        .eq('order_id', order.id);

    if (delErr) {
        console.error('Failed to cleanup:', delErr);
    } else {
        console.log('Test successful, data cleaned up.');
    }
}

runTest().catch(console.error);
