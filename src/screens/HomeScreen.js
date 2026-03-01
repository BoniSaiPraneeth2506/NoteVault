import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { shadows } from '../theme/colors';
import {
  getActiveNotes, moveNoteToTrash, cleanupSelfDestructNotes,
  getDeepVaultNotes, getDeepVaultPassword,
} from '../storage/database';

const FILTERS = ['All', 'Favorites', 'Pinned'];

const TEMPLATES = [
  { name: 'Blank', icon: 'file-text', title: '', content: '' },
  { name: 'Meeting', icon: 'users', title: 'Meeting Notes', content: 'Date: \nAttendees: \n\nAgenda:\n- \n\nNotes:\n\nAction Items:\n- ' },
  { name: 'To-Do', icon: 'check-square', title: 'To-Do List', content: '[ ] Task 1\n[ ] Task 2\n[ ] Task 3' },
  { name: 'Password', icon: 'lock', title: 'Password Entry', content: 'Service: \nUsername: \nPassword: \nURL: \nNotes: ' },
  { name: 'Journal', icon: 'book-open', title: 'Journal Entry', content: 'How I feel:\n\nToday\'s highlights:\n\nGrateful for:\n' },
  { name: 'Idea', icon: 'zap', title: 'New Idea', content: 'Idea:\n\nProblem it solves:\n\nDetails:\n\nNext steps:\n' },
];

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTimeLeft(iso) {
  if (!iso) return '';
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'Expiring...';
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return `${Math.floor(diff / 60000)}m left`;
}

export default function HomeScreen({ route, navigation }) {
  const isFakeMode = route.params?.isFakeMode || false;
  const { theme, isDark, toggleTheme, fontSizeMap } = useTheme();

  const [notes, setNotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const [templateModal, setTemplateModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState({ visible: false, noteId: null, notePassword: null });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [deepVaultMode, setDeepVaultMode] = useState(false);
  const [deepVaultUnlocked, setDeepVaultUnlocked] = useState(false);
  const [vaultPasswordModal, setVaultPasswordModal] = useState(false);
  const [vaultPasswordInput, setVaultPasswordInput] = useState('');
  const [vaultPasswordError, setVaultPasswordError] = useState('');
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const showConfirm = (title, message, onConfirm) =>
    setConfirmModal({ visible: true, title, message, onConfirm });
  const hideConfirm = () =>
    setConfirmModal(m => ({ ...m, visible: false, onConfirm: null }));

  const loadNotes = useCallback(async () => {
    await cleanupSelfDestructNotes();
    if (deepVaultMode && deepVaultUnlocked) {
      const data = await getDeepVaultNotes();
      setNotes(data);
    } else {
      const data = await getActiveNotes(isFakeMode);
      setNotes(data);
    }
  }, [isFakeMode, deepVaultMode, deepVaultUnlocked]);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [loadNotes])
  );

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (activeFilter === 'Favorites') list = list.filter(n => n.isFavorite === 1);
    if (activeFilter === 'Pinned') list = list.filter(n => n.isPinned === 1);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q))
      );
    }
    return list;
  }, [notes, activeFilter, searchQuery]);

  const handleDelete = (id, title) => {
    showConfirm(
      'Move to Trash',
      `"${title || 'Untitled'}" will be moved to trash.`,
      async () => { await moveNoteToTrash(id); loadNotes(); }
    );
  };

  const handleNotePress = (item) => {
    if (item.notePassword) {
      setPasswordModal({ visible: true, noteId: item.id, notePassword: item.notePassword });
      setPasswordInput('');
      setPasswordError('');
    } else {
      const hiddenFlag = deepVaultMode ? 2 : (isFakeMode ? 1 : 0);
      navigation.navigate('AddEditNote', { noteId: item.id, isFakeMode, hiddenFlag });
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === passwordModal.notePassword) {
      const noteId = passwordModal.noteId;
      setPasswordModal({ visible: false, noteId: null, notePassword: null });
      const hiddenFlag = deepVaultMode ? 2 : (isFakeMode ? 1 : 0);
      navigation.navigate('AddEditNote', { noteId, isFakeMode, hiddenFlag });
    } else {
      setPasswordError('Wrong password');
      setTimeout(() => setPasswordError(''), 2000);
    }
  };

  const handleTitleTripleTap = async () => {
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      tapCountRef.current += 1;
    } else {
      tapCountRef.current = 1;
    }
    lastTapRef.current = now;
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      if (deepVaultMode) {
        setDeepVaultMode(false);
        setDeepVaultUnlocked(false);
      } else {
        const pwd = await getDeepVaultPassword();
        if (!pwd) return;
        setVaultPasswordInput('');
        setVaultPasswordError('');
        setVaultPasswordModal(true);
      }
    }
  };

  const handleVaultPasswordSubmit = async () => {
    const pwd = await getDeepVaultPassword();
    if (vaultPasswordInput === pwd) {
      setVaultPasswordModal(false);
      setDeepVaultMode(true);
      setDeepVaultUnlocked(true);
    } else {
      setVaultPasswordError('Wrong password');
      setTimeout(() => setVaultPasswordError(''), 2000);
    }
  };

  const handleTemplateSelect = (template) => {
    setTemplateModal(false);
    const hiddenFlag = deepVaultMode ? 2 : (isFakeMode ? 1 : 0);
    navigation.navigate('AddEditNote', {
      isFakeMode, hiddenFlag,
      templateTitle: template.title,
      templateContent: template.content,
    });
  };

  const t = theme;

  const renderNoteCard = ({ item }) => {
    const noteColor = item.color || null;
    const borderColor = noteColor || t.primary;
    let images = [];
    try { images = JSON.parse(item.images) || []; } catch (_) {}
    const hasAttachments = images.length > 0 || item.audio;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.noteCard,
          {
            backgroundColor: t.card,
            borderColor: t.border,
            borderLeftColor: borderColor,
            borderLeftWidth: 4,
          },
          shadows.sm,
        ]}
        onPress={() => handleNotePress(item)}
        onLongPress={() => handleDelete(item.id, item.title)}
      >
        <View style={styles.noteBody}>
          <View style={styles.noteTitleRow}>
            <Text style={[styles.noteTitle, { color: t.textPrimary, fontSize: fontSizeMap.noteTitle }]} numberOfLines={1}>
              {item.title || 'Untitled'}
            </Text>
            <View style={styles.noteBadges}>
              {item.notePassword && <Feather name="lock" size={13} color={t.warning} style={{ marginLeft: 6 }} />}
              {item.isChecklist === 1 && <Feather name="check-square" size={13} color={t.info} style={{ marginLeft: 6 }} />}
              {item.selfDestructAt && (
                <View style={[styles.timerBadge, { backgroundColor: t.dangerLight }]}>
                  <Feather name="clock" size={10} color={t.danger} />
                  <Text style={[styles.timerText, { color: t.danger }]}>{formatTimeLeft(item.selfDestructAt)}</Text>
                </View>
              )}
            </View>
          </View>
          {item.content ? (
            <Text style={[styles.noteContent, { color: t.textSecondary, fontSize: fontSizeMap.noteContent }]} numberOfLines={2}>
              {item.notePassword ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : item.content.replace(/[*_#\[\]]/g, '')}
            </Text>
          ) : null}
          <View style={styles.noteFooter}>
            <Text style={[styles.noteDate, { color: t.textMuted }]}>
              {formatDate(item.timestamp)}
            </Text>
            <View style={styles.noteIcons}>
              {hasAttachments && <Feather name="paperclip" size={13} color={t.textMuted} style={{ marginRight: 6 }} />}
              {item.isPinned === 1 && <MaterialIcons name="push-pin" size={14} color={t.textMuted} style={{ marginRight: 4 }} />}
              {item.isFavorite === 1 && <MaterialIcons name="star" size={16} color={t.warning} />}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleTitleTripleTap} activeOpacity={0.8}>
            <Text style={[styles.headerTitle, { color: deepVaultMode ? t.warning : t.textPrimary }]}>
              {deepVaultMode ? 'Deep Vault' : 'NoteVault'}
            </Text>
            {deepVaultMode && <Feather name="lock" size={18} color={t.warning} style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {deepVaultMode && (
              <TouchableOpacity
                onPress={() => { setDeepVaultMode(false); setDeepVaultUnlocked(false); }}
                style={[styles.themeBtn, { backgroundColor: t.dangerLight, borderColor: t.danger, marginRight: 8 }]}
              >
                <Feather name="x" size={18} color={t.danger} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: t.card, borderColor: t.border }]}>
              <Feather name={isDark ? 'sun' : 'moon'} size={18} color={t.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: t.card, borderColor: t.border }]}>
          <Feather name="search" size={18} color={t.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: t.textPrimary }]}
            placeholder="Search notes..."
            placeholderTextColor={t.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={16} color={t.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setActiveFilter(f)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? t.primary : t.card,
                    borderColor: active ? t.primary : t.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#FFF' : t.textSecondary }]}>
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.noteCount}>
            <Text style={[styles.noteCountText, { color: t.textMuted }]}>
              {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes list */}
      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteCard}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={() => (
          <View style={styles.emptyBox}>
            <Feather name={deepVaultMode ? 'shield' : 'edit-3'} size={48} color={t.textMuted} />
            <Text style={[styles.emptyTitle, { color: t.textSecondary }]}>
              {deepVaultMode ? 'Deep Vault is empty' : 'No notes yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: t.textMuted }]}>
              {deepVaultMode ? 'Add secret notes here' : 'Tap + to create your first note'}
            </Text>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: t.primary }, shadows.lg]}
        activeOpacity={0.85}
        onPress={() => setTemplateModal(true)}
      >
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Template Picker Modal */}
      <Modal visible={templateModal} transparent animationType="fade" onRequestClose={() => setTemplateModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTemplateModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>New Note</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted, marginBottom: 12 }]}>Choose a template</Text>
            <View style={styles.templateGrid}>
              {TEMPLATES.map((tmpl) => (
                <TouchableOpacity
                  key={tmpl.name}
                  style={[styles.templateItem, { backgroundColor: t.background, borderColor: t.border }]}
                  onPress={() => handleTemplateSelect(tmpl)}
                  activeOpacity={0.7}
                >
                  <Feather name={tmpl.icon} size={22} color={t.primary} />
                  <Text style={[styles.templateName, { color: t.textPrimary }]}>{tmpl.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note Password Modal */}
      <Modal visible={passwordModal.visible} transparent animationType="fade" onRequestClose={() => setPasswordModal({ visible: false, noteId: null, notePassword: null })}>
        <Pressable style={styles.modalOverlay} onPress={() => setPasswordModal({ visible: false, noteId: null, notePassword: null })}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>Note Locked</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted }]}>Enter password to open this note</Text>
            <TextInput
              style={[styles.pwdInput, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.background }]}
              secureTextEntry autoFocus value={passwordInput}
              onChangeText={setPasswordInput} placeholder="Password"
              placeholderTextColor={t.textMuted} onSubmitEditing={handlePasswordSubmit}
            />
            {passwordError ? <Text style={[styles.pwdError, { color: t.danger }]}>{passwordError}</Text> : null}
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setPasswordModal({ visible: false, noteId: null, notePassword: null })} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePasswordSubmit} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.primary }]}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Deep Vault Password Modal */}
      <Modal visible={vaultPasswordModal} transparent animationType="fade" onRequestClose={() => setVaultPasswordModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setVaultPasswordModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>Deep Vault</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted }]}>Enter vault password</Text>
            <TextInput
              style={[styles.pwdInput, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.background }]}
              secureTextEntry autoFocus value={vaultPasswordInput}
              onChangeText={setVaultPasswordInput} placeholder="Vault password"
              placeholderTextColor={t.textMuted} onSubmitEditing={handleVaultPasswordSubmit}
            />
            {vaultPasswordError ? <Text style={[styles.pwdError, { color: t.danger }]}>{vaultPasswordError}</Text> : null}
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setVaultPasswordModal(false)} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleVaultPasswordSubmit} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.primary }]}>Open</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirm Modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={hideConfirm}>
        <Pressable style={styles.modalOverlay} onPress={hideConfirm}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>{confirmModal.title}</Text>
            <Text style={[styles.modalMessage, { color: t.textSecondary }]}>{confirmModal.message}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={hideConfirm} style={styles.modalBtn} activeOpacity={0.6}>
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { const fn = confirmModal.onConfirm; hideConfirm(); fn && fn(); }}
                style={styles.modalBtn}
                activeOpacity={0.6}
              >
                <Text style={[styles.modalBtnText, { color: t.danger }]}>Trash</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  themeBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, paddingHorizontal: 14, height: 46,
    borderWidth: 1, marginBottom: 18,
  },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, marginRight: 8, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  noteCount: { flex: 1, alignItems: 'flex-end' },
  noteCountText: { fontSize: 12, fontWeight: '500' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  noteCard: {
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1,
  },
  noteBody: { flex: 1 },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  noteBadges: { flexDirection: 'row', alignItems: 'center' },
  noteTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  noteContent: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  noteFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteDate: { fontSize: 12 },
  noteIcons: { flexDirection: 'row', alignItems: 'center' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 6 },
  timerText: { fontSize: 10, fontWeight: '600', marginLeft: 3 },
  emptyBox: { alignItems: 'center', marginTop: 120 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 100, right: 24,
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  // Confirm Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  modalCard: { width: '100%', borderRadius: 28, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 12, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  modalMessage: { fontSize: 14, lineHeight: 21, marginBottom: 24, opacity: 0.8 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 8 },
  templateItem: { width: '30%', alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: 1, margin: '1.5%' },
  templateName: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  pwdInput: { fontSize: 16, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  pwdError: { fontSize: 12, fontWeight: '600', marginBottom: 12, marginLeft: 4 },
});
