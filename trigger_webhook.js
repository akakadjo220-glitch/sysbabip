fetch('http://qq4skow800g8kookksgswsg4.188.241.58.227.sslip.io/api/webhooks/didit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ decision: { status: 'Approved', session_id: 'manual_recovery' } })
})
.then(res => res.json())
.then(data => console.log('Webhook result:', data))
.catch(err => console.error('Error:', err.message));
