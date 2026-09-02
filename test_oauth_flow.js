import http from 'http';
import mongoose from 'mongoose';
import app from './src/app.js';
import env from './src/config/env.js';
import * as googleOAuth from './src/services/googleOAuth.js';
import User from './src/models/User.js';

// Mock the Google services
googleOAuth.exchangeGoogleCode = async (code) => 'mock_access_token';
googleOAuth.getGoogleProfile = async (accessToken) => ({
  sub: '1234567890',
  email: 'testuser@example.com',
  name: 'Test User',
  picture: 'https://example.com/pic.jpg',
});

const PORT = 5555;
const BASE_URL = `http://localhost:${PORT}`;
let server;

async function runTest() {
  console.log('=== Connecting to Test Database ===');
  await mongoose.connect(env.MONGODB_URI);

  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  console.log('\n=== Starting OAuth GET Flow ===');
  const getResponse = await fetch(`${BASE_URL}/api/auth/google/callback?code=fake_code_123`, {
    redirect: 'manual' // Do not follow redirects so we can inspect cookies and Location
  });
  
  console.log('Redirect Status:', getResponse.status);
  console.log('Redirect Location:', getResponse.headers.get('location'));
  
  const setCookieHeader = getResponse.headers.get('set-cookie');
  console.log('Set-Cookie Header:', setCookieHeader);

  let tokenCookieValue = null;

  if (!setCookieHeader) {
    console.error('❌ No cookies were set in the GET response!');
  } else {
    console.log('✅ Cookies successfully set.');
    
    // Parse the cookie string
    const cookies = setCookieHeader.split(', '); // Handle multiple cookies if necessary
    for (const c of cookies) {
      if (c.startsWith('token=')) {
        tokenCookieValue = c.split(';')[0]; // Get the key=value part
      }
    }

    if (tokenCookieValue) {
      console.log('Token Cookie Value:', tokenCookieValue);
      
      console.log('\n=== Testing Authenticated Endpoint /api/auth/me ===');
      const meResponse = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: {
          'Cookie': tokenCookieValue // Send the exact cookie string
        }
      });
      
      console.log('Status:', meResponse.status);
      if (meResponse.status === 200) {
        const body = await meResponse.json();
        console.log('✅ Authenticated successfully!');
        console.log('User:', body.data.email);
      } else {
        const body = await meResponse.text();
        console.log('❌ Authentication failed:', body);
      }
    } else {
      console.error('❌ Token cookie not found in Set-Cookie header.');
    }
  }

  console.log('\n=== Starting OAuth POST Flow ===');
  const postResponse = await fetch(`${BASE_URL}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'fake_code_post_123' })
  });

  console.log('POST Status:', postResponse.status);
  const postSetCookieHeader = postResponse.headers.get('set-cookie');
  console.log('Set-Cookie Headers (POST):', postSetCookieHeader);
  const postBody = await postResponse.json();
  console.log('POST Body success:', postBody.success);

  console.log('\n=== Cleaning up ===');
  await User.deleteOne({ email: 'testuser@example.com' });
  await mongoose.disconnect();
  server.close();
  console.log('Done.');
}

runTest().catch(err => {
  console.error(err);
  if (server) server.close();
});
