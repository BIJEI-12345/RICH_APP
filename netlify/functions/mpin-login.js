const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
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
    return json(405, { success: false, message: 'Method not allowed' });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, message: 'Invalid JSON input' });
  }

  const mpin = String(input.mpin || '').trim();
  const email = input.email ? String(input.email).trim() : null;
  const mobile = input.mobile ? String(input.mobile).trim() : null;

  if (!/^\d{6}$/.test(mpin)) {
    return json(400, { success: false, message: 'Invalid MPIN format' });
  }
  if (!email && !mobile) {
    return json(400, { success: false, message: 'Missing required fields' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { success: false, message: 'Invalid email format' });
  }
  if (mobile && !/^\d{10}$/.test(mobile)) {
    return json(400, { success: false, message: 'Invalid mobile number format' });
  }

  const connectionString = process.env.DATABASE_URL;
  const host = process.env.DB_HOST_AWS || process.env.DB_HOST;
  const port = Number(process.env.DB_PORT_AWS || process.env.DB_PORT || 5432);
  const dbUser = process.env.DB_USER_AWS || process.env.DB_USER;
  const dbPassword = process.env.DB_PASS_AWS || process.env.DB_PASS;
  const database = process.env.DB_NAME_AWS || process.env.DB_NAME || 'postgres';

  if (!connectionString && (!host || !dbUser || dbPassword === undefined || !database)) {
    return json(500, { success: false, message: 'Server configuration error' });
  }

  const pool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
    : new Pool({ host, port, user: dbUser, password: dbPassword, database, ssl: { rejectUnauthorized: false } });

  try {
    const column = email ? 'email' : 'mobile';
    const credentials = email || mobile;
    const result = await pool.query(
      `SELECT id, email, mobile, mpin_password, email_verified FROM resident_information WHERE ${column} = $1 LIMIT 1`,
      [credentials]
    );
    const user = result.rows[0];

    if (!user || !isVerified(user.email_verified)) {
      return json(401, { success: false, message: 'User not found or email not verified' });
    }

    const stored = String(user.mpin_password || '');
    let valid = false;
    let legacyMatch = false;

    if (/^\d{6}$/.test(stored)) {
      valid = stored === mpin;
      legacyMatch = valid;
    } else if (stored) {
      valid = await bcrypt.compare(mpin, stored);
    }

    if (!valid) {
      return json(401, { success: false, message: 'Invalid MPIN' });
    }

    if (legacyMatch) {
      const hash = await bcrypt.hash(mpin, 12);
      try {
        await pool.query(
          'UPDATE resident_information SET mpin_password = $1, updated_at = NOW() WHERE id = $2',
          [hash, user.id]
        );
      } catch (updateError) {
        console.error('Legacy MPIN upgrade error:', updateError.message || updateError);
      }
    }

    return json(200, {
      success: true,
      message: 'MPIN verification successful',
      user: { email: user.email, mobile: user.mobile || null }
    });
  } catch (error) {
    console.error('MPIN login database error:', error.message || error);
    return json(500, { success: false, message: 'MPIN verification failed' });
  } finally {
    await pool.end();
  }
};
