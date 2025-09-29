async function testAuthentication() {
  try {
    console.log('🔐 Testing authentication...');

    const response = await fetch('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@acme.dev',
        password: 'SuperAdmin123!'
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Authentication successful!');
      console.log('Response status:', response.status);
      console.log('Token received:', data.token ? 'Yes' : 'No');
      console.log('User role:', data.user?.role);
    } else {
      console.error('❌ Authentication failed:');
      console.error('Status:', response.status);
      console.error('Data:', data);
    }

  } catch (error) {
    console.error('❌ Authentication error:', error.message);
  }
}

testAuthentication();