const fs = require('fs');
const file = 'lib/services/deliveries.supabase.ts';
let code = fs.readFileSync(file, 'utf8');

// Add import
code = code.replace(
  "import type { Stop, ManualOrder } from '@/lib/types';",
  "import type { Stop, ManualOrder, ModifiedDrop } from '@/lib/types';\nimport { loadModifiedDropsForDate, loadDropsMovedToDate } from './persistence.supabase';"
);

// Update fetchDeliveriesForDate definition
code = code.replace(
  "export async function fetchDeliveriesForDate(deliveryDate: string): Promise<Stop[]> {",
  "export async function fetchDeliveriesForDate(deliveryDate: string): Promise<Stop[]> {"
);

// Add the modified drops fetching near the top of fetchDeliveriesForDate
const fetchOrdersBlock = `  // Fetch orders for the given delivery date
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, delivery_window, status')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled');`;

const modifiedDropsLogic = `  // 1. Fetch originally scheduled orders for the given date
  const { data: originalOrders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, delivery_window, status, delivery_date')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled');

  if (ordersError) {
    throw new Error(\`Supabase error: \${ordersError.message}\`);
  }

  // 2. Fetch modified drops rules for this date (moved away, time changed, or moved TO this date)
  const modifiedDropsAwayOrChanged = await loadModifiedDropsForDate(deliveryDate);
  const modifiedDropsToHere = await loadDropsMovedToDate(deliveryDate);
  
  // Create a fast lookup for modifications
  const modsByOrderId = new Map<string, any>();
  for (const mod of [...modifiedDropsAwayOrChanged, ...modifiedDropsToHere]) {
    // Keep the most recent modification if there are multiple (shouldn't happen with proper upsert)
    modsByOrderId.set(mod.order_id, mod);
  }

  // 3. Filter and adjust the current day's drops
  let ordersList = originalOrders || [];
  
  // - Filter out drops moved away
  ordersList = ordersList.filter(o => {
    const mod = modsByOrderId.get(o.id);
    if (!mod) return true; // No modification = keep
    
    // If it has a new date and it's NOT today, exclude it
    if (mod.new_delivery_date && mod.new_delivery_date !== deliveryDate) {
      return false; 
    }
    return true; // Keep if date is same or new_date is null (e.g. just a time change)
  });

  // - Add drops moved TO this date from other dates
  if (modifiedDropsToHere.length > 0) {
    const toHereIds = modifiedDropsToHere.map(m => m.order_id);
    const { data: movedOrders } = await supabase
      .from('orders')
      .select('id, user_id, delivery_window, status, delivery_date')
      .in('id', toHereIds)
      .neq('status', 'cancelled');
      
    if (movedOrders) {
      for (const movedOrder of movedOrders) {
        // Prevent duplicates
        if (!ordersList.some(o => o.id === movedOrder.id)) {
          ordersList.push(movedOrder);
        }
      }
    }
  }`;

code = code.replace(fetchOrdersBlock, modifiedDropsLogic);

// Replace "orders" usage with "ordersList" in the profile fetching section
code = code.replace(
  "  if (!orders || orders.length === 0) {\n    return [];\n  }\n\n  // Fetch profiles for all user_ids\n  const userIds = orders.filter(o => o.user_id).map(o => o.user_id) as string[];",
  "  if (!ordersList || ordersList.length === 0) {\n    return [];\n  }\n\n  // Fetch profiles for all user_ids\n  const userIds = ordersList.filter(o => o.user_id).map(o => o.user_id) as string[];"
);

// Replace the loop to use ordersList and apply time modifications
code = code.replace(
  "  for (const order of orders as any[]) {",
  "  for (const order of ordersList as any[]) {"
);

// Apply time window modifications in the loop
const parseTimeBlock = "    const { start, end } = parseTimeWindow(order.delivery_window, baseDate);";
const parseTimeModified = `    // Apply time window overrides if a modification exists
    const mod = modsByOrderId.get(order.id);
    let timeWindowStr = order.delivery_window;
    
    if (mod && mod.new_delivery_window_start && mod.new_delivery_window_end) {
      timeWindowStr = \`\${mod.new_delivery_window_start}-\${mod.new_delivery_window_end}\`;
    }
    
    const { start, end } = parseTimeWindow(timeWindowStr, baseDate);`;

code = code.replace(parseTimeBlock, parseTimeModified);

fs.writeFileSync(file, code);
