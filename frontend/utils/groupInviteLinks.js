export function groupInviteToken(url) {
  try {
    const parsed = new URL(url);
    const token = parsed.protocol === 'pang3:' && parsed.hostname === 'join'
      ? parsed.searchParams.get('token')
      : parsed.protocol === 'https:' && parsed.hostname === 'pinwork.co.kr' && /^\/join\/[A-Za-z0-9_-]{43}\/?$/.test(parsed.pathname)
        ? parsed.pathname.split('/')[2] : null;
    return /^[A-Za-z0-9_-]{43}$/.test(token || '') ? token : null;
  } catch { return null; }
}
