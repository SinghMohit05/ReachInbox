import assert from 'assert';
import { prisma } from './config/prisma.js';
import { generateToken } from './auth/jwt.js';

async function testAuth() {
  console.log('🔒 Verifying Authentication Implementation (Zero Default User)...');
  const baseUrl = 'http://localhost:4000';

  // 1. Unauthenticated /auth/me should be 401
  const unauthRes = await fetch(`${baseUrl}/auth/me`);
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
  const unauthJson = (await unauthRes.json()) as any;
  assert.strictEqual(unauthJson.success, false);
  console.log('✅ Unauthenticated access to /auth/me rejected with 401');

  // 2. Create an ephemeral test user and sender
  const testUser = await prisma.user.create({
    data: {
      name: 'Auth Test Runner',
      email: `auth-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `auth-sender-${Date.now()}@domain.io`,
          displayName: 'Auth Sender',
          enabled: true,
        },
      },
    },
    include: {
      senders: true,
    },
  });

  try {
    // 3. Generate valid JWT token for test user
    const token = generateToken({
      userId: testUser.id,
      email: testUser.email,
    });

    // 4. Authenticated /auth/me with Bearer token
    const authRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.strictEqual(authRes.status, 200, 'Authenticated request must return 200');
    const authJson = (await authRes.json()) as any;
    assert.strictEqual(authJson.user.email, testUser.email);
    assert(authJson.user.senders.length >= 1, 'Must return senders');
    console.log(`✅ Verified /auth/me with Bearer token: User ID=${authJson.user.id}, Senders=${authJson.user.senders.length}`);

    // 5. Invalid token must be rejected with 401
    const invalidRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid_bogus_jwt_token',
      },
    });
    assert.strictEqual(invalidRes.status, 401, 'Invalid token must return 401');
    console.log('✅ Invalid token rejected with 401');

    // 6. Logout endpoint test
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout must return 200');
    console.log('✅ Logout endpoint succeeded with 200');

    console.log('🎯 Authentication Verification PASSED 100% (No Default User)!');
  } finally {
    // Cleanup ephemeral test user
    await prisma.user.delete({
      where: { id: testUser.id },
    });
    console.log('🧹 Ephemeral test user cleaned up.');
  }
}

testAuth().catch((err) => {
  console.error('❌ Auth verification failed:', err);
  process.exit(1);
});
