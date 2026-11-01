export const isGeneratedLoginId = value => /^social-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value || '');
export const needsLoginSetup = user => user?.loginSetupRequired ?? isGeneratedLoginId(user?.loginId);
export const visibleLoginId = value => isGeneratedLoginId(value) ? '' : (value || '');
