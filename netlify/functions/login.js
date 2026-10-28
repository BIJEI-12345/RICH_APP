const { Pool } = require('pg');

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function isVerified(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 't'].includes(String(value ?? '').toLowerCase());
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' }, { Allow: 'POST' });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, message: 'Invalid JSON input' });
  }

  const loginType = input.login_type;
  const credentials = String(input.credentials || '').trim();

  if (!loginType || !credentials) {
    return json(400, { success: false, message: 'Missing required fields' });
  }
  if (!['email', 'mobile'].includes(loginType)) {
    return json(400, { success: false, message: 'Invalid login type' });
  }
  if (loginType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials)) {
    return json(400, { success: false, message: 'Invalid email format' });
  }
  if (loginType === 'mobile' && !/^\d{10}$/.test(credentials)) {
    return json(400, { success: false, message: 'Invalid mobile number format' });
  }

  const connectionString = process.env.DATABASE_URL;
  const host = process.env.DB_HOST_AWS || process.env.DB_HOST;
  const port = Number(process.env.DB_PORT_AWS || process.env.DB_PORT || 5432);
  const user = process.env.DB_USER_AWS || process.env.DB_USER;
  const password = process.env.DB_PASS_AWS || process.env.DB_PASS;
  const database = process.env.DB_NAME_AWS || process.env.DB_NAME || 'postgres';

  if (!connectionString && (!host || !user || password === undefined || !database)) {
    return json(500, { success: false, message: 'Server configuration error' });
  }

  const pool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
    : new Pool({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });

  try {
    const column = loginType === 'email' ? 'email' : 'mobile';
    const query = `SELECT email, mobile, email_verified FROM resident_information WHERE ${column} = $1 LIMIT 1`;
    const result = await pool.query(query, [credentials]);
    const user = result.rows[0];

    if (!user || !isVerified(user.email_verified)) {
      return json(401, { success: false, message: 'User not found or account inactive' });
    }

    return json(200, {
      success: true,
      message: 'Login successful',
      user: { email: user.email, mobile: user.mobile || null }
    });
  } catch (error) {
    console.error('Login database error:', error.message || error);
    return json(500, { success: false, message: 'Database operation failed' });
  } finally {
    await pool.end();
  }
};
