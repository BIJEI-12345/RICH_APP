const { createClient } = require('@supabase/supabase-js');

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const column = loginType === 'email' ? 'email' : 'mobile';
    const { data: user, error } = await supabase
      .from('resident_information')
      .select('email,mobile,email_verified')
      .eq(column, credentials)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!user || !isVerified(user.email_verified)) {
      return json(401, { success: false, message: 'User not found or account inactive' });
    }

    return json(200, {
      success: true,
      message: 'Login successful',
      user: { email: user.email, mobile: user.mobile || null }
    });
  } catch (error) {
    console.error('Supabase login error:', error.message || error);
    return json(500, { success: false, message: 'Database operation failed' });
  }
};
