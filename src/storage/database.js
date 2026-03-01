import * as SQLite from 'expo-sqlite';

let db;
let dbReady = false;

const getDb = async () => {
  if (!db || !dbReady) {
    await initDatabase();
  }
  return db;
};

export const initDatabase = async () => {
  if (dbReady && db) return; // already initialized
  db = await SQLite.openDatabaseAsync('notevault.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      color TEXT,
      isFavorite INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      isHidden INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      images TEXT,
      audio TEXT,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS security_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT
    );
  `);

  // Migrations for new columns (safe to run repeatedly)
  const addCol = async (col, type) => {
    try { await db.execAsync(`ALTER TABLE notes ADD COLUMN ${col} ${type}`); } catch (_) {}
  };
  await addCol('selfDestructAt', 'TEXT');
  await addCol('isChecklist', 'INTEGER DEFAULT 0');
  await addCol('notePassword', 'TEXT');
  await addCol('deletedAt', 'TEXT');
  await addCol('reminder', 'TEXT');
  await addCol('reminderNotifId', 'TEXT');

  dbReady = true;
};

// ── Settings helpers ──────────────────────────────────

export const getSetting = async (key) => {
  const d = await getDb();
  const row = await d.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
};

export const setSetting = async (key, value) => {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
};

// PIN
export const getAppPin = async () => getSetting('user_pin');
export const setAppPin = async (pin) => setSetting('user_pin', pin);
export const getFakePin = async () => getSetting('fake_pin');
export const setFakePin = async (pin) => setSetting('fake_pin', pin);

// Dark mode
export const getDarkMode = async () => getSetting('dark_mode');
export const setDarkMode = async (val) => setSetting('dark_mode', val);

// Biometric
export const getBiometricEnabled = async () => (await getSetting('biometric_enabled')) === '1';
export const setBiometricEnabled = async (on) => setSetting('biometric_enabled', on ? '1' : '0');

// Auto-lock
export const getAutoLockSeconds = async () => {
  const val = await getSetting('auto_lock_seconds');
  return val ? parseInt(val) : 0;
};
export const setAutoLockSeconds = async (s) => setSetting('auto_lock_seconds', String(s));

// Shake to lock
export const getShakeToLock = async () => (await getSetting('shake_to_lock')) === '1';
export const setShakeToLock = async (on) => setSetting('shake_to_lock', on ? '1' : '0');

// Font size
export const getFontSize = async () => (await getSetting('font_size')) || 'medium';
export const setFontSize = async (s) => setSetting('font_size', s);

// Deep vault
export const getDeepVaultPassword = async () => getSetting('deep_vault_password');
export const setDeepVaultPassword = async (p) => setSetting('deep_vault_password', p);

// ── App Usage Streak ──────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export const getStreak = async () => parseInt((await getSetting('streak_count')) || '0');

export const updateStreak = async () => {
  const t = today();
  const last = await getSetting('last_open_date');
  if (last === t) return; // already updated today
  const cur = parseInt((await getSetting('streak_count')) || '0');
  const newStreak = last === yesterday() ? cur + 1 : 1;
  await setSetting('last_open_date', t);
  await setSetting('streak_count', String(newStreak));
};

// ── Security Log ──────────────────────────────────────

export const addSecurityLog = async (eventType, details = '') => {
  const d = await getDb();
  await d.runAsync('INSERT INTO security_log (timestamp, event_type, details) VALUES (?, ?, ?)',
    [new Date().toISOString(), eventType, details]);
};

export const getSecurityLogs = async (limit = 50) => {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM security_log ORDER BY timestamp DESC LIMIT ?', [limit]);
};

export const clearSecurityLogs = async () => {
  const d = await getDb();
  await d.runAsync('DELETE FROM security_log');
};

// ── Notes CRUD ────────────────────────────────────────

export const getActiveNotes = async (isFakeMode = false) => {
  const d = await getDb();
  const hiddenFlag = isFakeMode ? 1 : 0;
  return await d.getAllAsync(
    'SELECT * FROM notes WHERE isDeleted = 0 AND isHidden = ? ORDER BY isPinned DESC, timestamp DESC',
    [hiddenFlag]
  );
};

export const getDeepVaultNotes = async () => {
  const d = await getDb();
  return await d.getAllAsync(
    'SELECT * FROM notes WHERE isDeleted = 0 AND isHidden = 2 ORDER BY isPinned DESC, timestamp DESC'
  );
};

export const getDeletedNotes = async () => {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM notes WHERE isDeleted = 1 ORDER BY timestamp DESC');
};

export const getNoteById = async (id) => {
  const d = await getDb();
  return await d.getFirstAsync('SELECT * FROM notes WHERE id = ?', [id]);
};

export const cleanupSelfDestructNotes = async () => {
  const d = await getDb();
  const now = new Date().toISOString();
  await d.runAsync('DELETE FROM notes WHERE selfDestructAt IS NOT NULL AND selfDestructAt <= ? AND isDeleted = 0', [now]);
};

export const saveNote = async (note) => {
  const d = await getDb();
  const { id, title, content, color, isFavorite, isPinned, isHidden, images, audio,
          selfDestructAt, isChecklist, notePassword, reminder, reminderNotifId } = note;
  const timestamp = new Date().toISOString();

  const existingNote = await getNoteById(id);

  if (existingNote) {
    await d.runAsync(
      `UPDATE notes SET title=?, content=?, color=?, isFavorite=?, isPinned=?, isHidden=?,
       images=?, audio=?, timestamp=?, selfDestructAt=?, isChecklist=?, notePassword=?,
       reminder=?, reminderNotifId=? WHERE id=?`,
      [title, content, color || null, isFavorite ? 1 : 0, isPinned ? 1 : 0, isHidden || 0,
       JSON.stringify(images || []), audio || null, timestamp,
       selfDestructAt || null, isChecklist ? 1 : 0, notePassword || null,
       reminder || null, reminderNotifId || null, id]
    );
  } else {
    await d.runAsync(
      `INSERT INTO notes (id, title, content, color, isFavorite, isPinned, isHidden, isDeleted,
       images, audio, timestamp, selfDestructAt, isChecklist, notePassword, reminder, reminderNotifId)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, content, color || null, isFavorite ? 1 : 0, isPinned ? 1 : 0, isHidden || 0,
       JSON.stringify(images || []), audio || null, timestamp,
       selfDestructAt || null, isChecklist ? 1 : 0, notePassword || null,
       reminder || null, reminderNotifId || null]
    );
  }
};

// Duplicate a note (creates a copy with new id)
export const duplicateNote = async (id) => {
  const note = await getNoteById(id);
  if (!note) return null;
  const d = await getDb();
  const newId = Math.random().toString(36).substr(2, 15) + Date.now().toString(36);
  await d.runAsync(
    `INSERT INTO notes (id, title, content, color, isFavorite, isPinned, isHidden, isDeleted,
     images, audio, timestamp, selfDestructAt, isChecklist, notePassword)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?)`,
    [newId, `${note.title || 'Untitled'} (Copy)`, note.content, note.color,
     note.isFavorite, note.isPinned, note.isHidden,
     note.images, note.audio, new Date().toISOString(),
     note.isChecklist, note.notePassword]
  );
  return newId;
};

export const moveNoteToTrash = async (id) => {
  const d = await getDb();
  await d.runAsync('UPDATE notes SET isDeleted = 1, deletedAt = ? WHERE id = ?', [new Date().toISOString(), id]);
};

export const autoDeleteOldTrash = async () => {
  const d = await getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await d.runAsync('DELETE FROM notes WHERE isDeleted = 1 AND deletedAt IS NOT NULL AND deletedAt <= ?', [cutoff]);
};

export const restoreNoteFromTrash = async (id) => {
  const d = await getDb();
  await d.runAsync('UPDATE notes SET isDeleted = 0 WHERE id = ?', [id]);
};

export const deleteNotePermanently = async (id) => {
  const d = await getDb();
  await d.runAsync('DELETE FROM notes WHERE id = ?', [id]);
};

export const emptyTrash = async () => {
  const d = await getDb();
  await d.runAsync('DELETE FROM notes WHERE isDeleted = 1');
};

export const deleteAllNotes = async () => {
  const d = await getDb();
  await d.runAsync('DELETE FROM notes');
};

export const getAllNotes = async () => {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM notes WHERE isDeleted = 0 ORDER BY timestamp DESC');
};

export const getNotesCount = async () => {
  const d = await getDb();
  const row = await d.getFirstAsync('SELECT COUNT(*) as count FROM notes WHERE isDeleted = 0');
  return row ? row.count : 0;
};

export const getTrashCount = async () => {
  const d = await getDb();
  const row = await d.getFirstAsync('SELECT COUNT(*) as count FROM notes WHERE isDeleted = 1');
  return row ? row.count : 0;
};
