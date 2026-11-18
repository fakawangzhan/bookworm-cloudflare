// Old unscoped records are read only for their recorded owner. They are never
// deleted or relabelled as another account's data during migration.
export function accountCache(user, storage) {
  const prefix = `bookworm-account-v1:${encodeURIComponent(user?.id || 'anonymous')}:`;
  let legacyOwner = '';
  try {
    const preferences = JSON.parse(storage.getItem('novelforge-preferences-v1') || '{}');
    const project = JSON.parse(storage.getItem('novelforge-project-v1') || '{}');
    legacyOwner = preferences.currentUserId || project.currentUserId || '';
  } catch {}
  let legacyAllowed = Boolean(user && (legacyOwner === user.id || !legacyOwner && user.id === 'user-system-admin'));
  return {
    getItem(key) {
      if (!user) return null;
      return storage.getItem(prefix + key) ?? (legacyAllowed ? storage.getItem(key) : null);
    },
    setItem(key, value) { if (user) storage.setItem(prefix + key, value); },
    removeItem(key) { if (user) storage.setItem(prefix + key, ''); },
    useLegacyWorkspace(workspace) { if (!legacyOwner && this.ownsLegacy(workspace)) legacyAllowed = true; },
    ownsLegacy(workspace) {
      if (!user || !workspace) return false;
      if (workspace.currentUserId) return workspace.currentUserId === user.id;
      return workspace.books?.length ? workspace.books.every(b => b.ownerId === user.id) : legacyAllowed;
    }
  };
}
