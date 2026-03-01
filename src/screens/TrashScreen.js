import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { shadows } from '../theme/colors';
import { getDeletedNotes, restoreNoteFromTrash, deleteNotePermanently, emptyTrash, autoDeleteOldTrash } from '../storage/database';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function TrashScreen() {
  const [deletedNotes, setDeletedNotes] = useState([]);
  const { theme, isDark, toggleTheme } = useTheme();
  const t = theme;

  // Custom confirm modal state
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });

  const showConfirm = (title, message, onConfirm) => {
    setConfirmModal({ visible: true, title, message, onConfirm });
  };
  const hideConfirm = () => setConfirmModal({ visible: false, title: '', message: '', onConfirm: null });

  const loadNotes = async () => {
    await autoDeleteOldTrash();
    const notes = await getDeletedNotes();
    setDeletedNotes(notes);
  };

  useFocusEffect(useCallback(() => { loadNotes(); }, []));

  const handleRestore = async (id) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await restoreNoteFromTrash(id);
    loadNotes();
  };

  const handleDelete = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showConfirm(
      'Delete Permanently',
      'This note will be permanently deleted and cannot be recovered.',
      async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); await deleteNotePermanently(id); loadNotes(); }
    );
  };

  const handleEmptyTrash = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    showConfirm(
      'Empty Trash',
      `All ${deletedNotes.length} note${deletedNotes.length !== 1 ? 's' : ''} will be permanently deleted.`,
      async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); await emptyTrash(); loadNotes(); }
    );
  };

  const renderTrashItem = ({ item }) => {
    const borderColor = item.color || t.danger;
    return (
      <View style={[styles.trashCard, { backgroundColor: t.card, borderColor: t.border, borderLeftColor: borderColor }, shadows.sm]}>
        <View style={styles.trashBody}>
          <Text style={[styles.trashTitle, { color: t.textPrimary }]} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          {item.content ? (
            <Text style={[styles.trashContent, { color: t.textSecondary }]} numberOfLines={2}>
              {item.content}
            </Text>
          ) : null}
          <Text style={[styles.trashDate, { color: t.textMuted }]}>
            Deleted · {formatDate(item.timestamp)}
          </Text>
        </View>
        <View style={[styles.trashActions, { borderTopColor: t.border }]}>
          <TouchableOpacity onPress={() => handleRestore(item.id)} style={styles.actionBtn}>
            <Feather name="refresh-ccw" size={15} color={t.primary} />
            <Text style={[styles.actionText, { color: t.primary }]}>Restore</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: t.border }]} />
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
            <Feather name="trash-2" size={15} color={t.danger} />
            <Text style={[styles.actionText, { color: t.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: t.textPrimary }]}>Trash</Text>
        <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: t.card, borderColor: t.border }]}>
          <Feather name={isDark ? 'sun' : 'moon'} size={18} color={t.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Subheader */}
      <View style={styles.subheader}>
        <View>
          <Text style={[styles.itemCount, { color: t.textMuted }]}>
            {deletedNotes.length} item{deletedNotes.length !== 1 ? 's' : ''} in trash
          </Text>
          <Text style={[styles.autoDeleteHint, { color: t.textMuted }]}>
            Auto-deletes after 30 days
          </Text>
        </View>
        {deletedNotes.length > 0 && (
          <TouchableOpacity onPress={handleEmptyTrash} style={[styles.emptyBtn, { backgroundColor: t.dangerLight }]}>
            <Feather name="trash" size={14} color={t.danger} />
            <Text style={[styles.emptyBtnText, { color: t.danger }]}>Empty Trash</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={deletedNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderTrashItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={() => (
          <View style={styles.emptyBox}>
            <Feather name="trash" size={48} color={t.textMuted} />
            <Text style={[styles.emptyTitle, { color: t.textSecondary }]}>Trash is empty</Text>
            <Text style={[styles.emptySubtitle, { color: t.textMuted }]}>Deleted notes will appear here</Text>
          </View>
        )}
      />

      {/* ─── Confirm Modal ─── */}
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
                onPress={() => { hideConfirm(); confirmModal.onConfirm && confirmModal.onConfirm(); }}
                style={styles.modalBtn}
                activeOpacity={0.6}
              >
                <Text style={[styles.modalBtnText, { color: t.danger }]}>Delete</Text>
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  themeBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  subheader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  itemCount: { fontSize: 13, fontWeight: '500' },
  autoDeleteHint: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  trashCard: {
    borderRadius: 16, marginBottom: 12, borderWidth: 1, borderLeftWidth: 4, overflow: 'hidden',
  },
  trashBody: { padding: 16 },
  trashTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  trashContent: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  trashDate: { fontSize: 12 },
  trashActions: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11,
  },
  actionText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  actionDivider: { width: 1 },
  emptyBox: { alignItems: 'center', marginTop: 120 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 6 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  modalCard: { width: '100%', borderRadius: 28, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 12, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  modalMessage: { fontSize: 14, lineHeight: 21, marginBottom: 24, opacity: 0.8 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
});
