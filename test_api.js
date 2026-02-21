async function run() {
  const url = 'http://localhost:3000/api/deliveries/modify-drop'\;
  
  // First we need a valid order ID and date from the DB.
  // Using generic test data to verify the API shape first.
  const payload = {
    order_id: '123e4567-e89b-12d3-a456-426614174000',
    original_delivery_date: '2026-02-23',
    new_delivery_date: '2026-02-24',
    new_delivery_window_start: '10:00',
    new_delivery_window_end: '12:00',
    notes: 'Testing via API'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
