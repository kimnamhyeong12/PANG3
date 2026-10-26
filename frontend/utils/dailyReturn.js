// Calendar decisions are per user, independent of app restarts and device timezone.
export const koreaDay = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export async function dailyReturnChoice(storage, userId, ask, now = new Date()) {
 const key = `workplace-return:${userId}`;
 const day = koreaDay(now);
 let saved;
 try { saved = JSON.parse(await storage.getItem(key)); } catch (_) {}
 if (saved?.day === day && typeof saved.include === 'boolean') return saved.include;
 const include = await ask();
 await storage.setItem(key, JSON.stringify({ day, include: Boolean(include) }));
 return Boolean(include);
}
