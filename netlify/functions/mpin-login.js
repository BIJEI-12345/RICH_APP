const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const column = email ? 'email' : 'mobile';
    const credentials = email || mobile;
    const { data: user, error } = await supabase
      .from('resident_information')
      .select('id,email,mobile,mpin_password,email_verified')
      .eq(column, credentials)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
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
      const { error: updateError } = await supabase
        .from('resident_information')
        .update({ mpin_password: hash, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        console.error('Legacy MPIN upgrade error:', updateError.message || updateError);
      }
    }

    return json(200, {
      success: true,
      message: 'MPIN verification successful',
      user: { email: user.email, mobile: user.mobile || null }
    });
  } catch (error) {
    console.error('Supabase MPIN login error:', error.message || error);
    return json(500, { success: false, message: 'MPIN verification failed' });
  }
};
