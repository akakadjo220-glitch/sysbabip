// Using native fetch

async function testDidit() {
    const url = 'https://verification.didit.me/v3/session/';
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'gkjZnCYzBXgXiWjLNarfXeq8HLCFK0fnzSgulw7NZ9s'
      },
      body: JSON.stringify({
        workflow_id: '8fa09204-b88d-442d-ad51-98757f60e0fb',
        vendor_data: 'test-user-123',
        callback: 'https://qq4skow800g8kookksgswsg4.188.241.58.227.sslip.io'
      })
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', data);
    } catch (err) {
        console.error('Error:', err);
    }
}

testDidit();
