import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Text, Image, Alert, Modal, Pressable, Keyboard, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
const Notifications = Constants.appOwnership === 'expo' ? null : require('expo-notifications');
import { useTheme } from '../theme/ThemeContext';
import { noteColors, shadows } from '../theme/colors';
import { getNoteById, saveNote, moveNoteToTrash } from '../storage/database';

// Darken a hex color for dark mode backgrounds
function dimColor(hex, factor = 0.25) {
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function parseChecklistItems(text) {
  if (!text) return [{ checked: false, text: '' }];
  return text.split('\n').map(line => {
    if (line.startsWith('[x] ')) return { checked: true, text: line.slice(4) };
    if (line.startsWith('[ ] ')) return { checked: false, text: line.slice(4) };
    return { checked: false, text: line };
  });
}

function serializeChecklistItems(items) {
  return items.map(i => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n');
}

const TIMER_OPTIONS = [
  { label: '1 Hour', hours: 1 },
  { label: '6 Hours', hours: 6 },
  { label: '1 Day', hours: 24 },
  { label: '1 Week', hours: 168 },
  { label: 'Remove Timer', hours: 0 },
];

export default function AddEditNoteScreen({ route, navigation }) {
  const noteId = route.params?.noteId;
  const isFakeMode = route.params?.isFakeMode || false;
  const hiddenFlag = route.params?.hiddenFlag || (isFakeMode ? 1 : 0);
  const templateTitle = route.params?.templateTitle;
  const templateContent = route.params?.templateContent;
  const { theme, isDark, fontSizeMap } = useTheme();
  const t = theme;

  const [title, setTitle] = useState(templateTitle || '');
  const [content, setContent] = useState(templateContent || '');
  const [color, setColor] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [images, setImages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [audioUri, setAudioUri] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const progressIntervalRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const [selfDestructAt, setSelfDestructAt] = useState(null);
  const [isChecklist, setIsChecklist] = useState(false);
  const [notePassword, setNotePassword] = useState(null);
  const [checklistItems, setChecklistItems] = useState([{ checked: false, text: '' }]);
  const [timerModal, setTimerModal] = useState(false);
  const [reminderModal, setReminderModal] = useState(false);
  const [reminderAt, setReminderAt] = useState(null);
  const [reminderNotifId, setReminderNotifId] = useState(null);
  const [passwordSetModal, setPasswordSetModal] = useState(false);
  const [passwordSetInput, setPasswordSetInput] = useState('');
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });

  // Undo/Redo history stack
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastSnapshot = useRef({ title: '', content: '' });
  const isUndoRedo = useRef(false);

  const pushHistory = useCallback((t, c) => {
    if (isUndoRedo.current) return;
    const last = lastSnapshot.current;
    if (t === last.title && c === last.content) return;
    undoStack.current.push({ title: last.title, content: last.content });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    lastSnapshot.current = { title: t, content: c };
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    Haptics.selectionAsync();
    isUndoRedo.current = true;
    redoStack.current.push({ title, content });
    const prev = undoStack.current.pop();
    setTitle(prev.title);
    setContent(prev.content);
    lastSnapshot.current = { title: prev.title, content: prev.content };
    setTimeout(() => { isUndoRedo.current = false; }, 50);
  }, [title, content]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    Haptics.selectionAsync();
    isUndoRedo.current = true;
    undoStack.current.push({ title, content });
    const next = redoStack.current.pop();
    setTitle(next.title);
    setContent(next.content);
    lastSnapshot.current = { title: next.title, content: next.content };
    setTimeout(() => { isUndoRedo.current = false; }, 50);
  }, [title, content]);

  const showConfirm = (title, message, onConfirm) =>
    setConfirmModal({ visible: true, title, message, onConfirm });
  const hideConfirm = () =>
    setConfirmModal(m => ({ ...m, visible: false, onConfirm: null }));

  // expo-audio hooks
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPlayer = useAudioPlayer(audioUri ? { uri: audioUri } : null);

  const formatAudioTime = (secs) => {
    if (!secs || isNaN(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Cleanup progress interval on unmount
  useEffect(() => () => stopProgressTimer(), []);

  // Stable ID — generated once, reused across all saves
  const [noteIdFinal] = useState(() =>
    noteId || (Math.random().toString(36).substring(2, 15) + Date.now().toString(36))
  );

  // Refs to hold latest state for the beforeRemove auto-save handler
  const noteDataRef = useRef({});
  const isSavingRef = useRef(false);

  useEffect(() => {
    const loadNote = async () => {
      const id = route.params?.noteId;
      if (!id) return;
      try {
        const note = await getNoteById(id);
        if (note) {
          setTitle(note.title || '');
          setContent(note.content || '');
          setColor(note.color || null);
          setIsFavorite(note.isFavorite === 1);
          setIsPinned(note.isPinned === 1);
          try { setImages(JSON.parse(note.images) || []); } catch (_) { setImages([]); }
          setAudioUri(note.audio || null);
          setSelfDestructAt(note.selfDestructAt || null);
          setReminderAt(note.reminder || null);
          setReminderNotifId(note.reminderNotifId || null);
          setIsChecklist(note.isChecklist === 1);
          setNotePassword(note.notePassword || null);
          if (note.isChecklist === 1 && note.content) {
            setChecklistItems(parseChecklistItems(note.content));
          }
        }
      } catch (e) {
        console.error('Failed to load note:', e);
      }
    };
    loadNote();
  }, [route.params?.noteId]);

  // Keep ref in sync with latest state so beforeRemove always has current data
  useEffect(() => {
    noteDataRef.current = { title, content, color, isFavorite, isPinned, images, audioUri, selfDestructAt, reminderAt, reminderNotifId, isChecklist, notePassword, checklistItems };
  }, [title, content, color, isFavorite, isPinned, images, audioUri, selfDestructAt, reminderAt, reminderNotifId, isChecklist, notePassword, checklistItems]);

  // Push undo history on debounced content/title changes
  useEffect(() => {
    const timer = setTimeout(() => pushHistory(title, content), 500);
    return () => clearTimeout(timer);
  }, [title, content, pushHistory]);

  // Word/char count
  const textForCount = isChecklist
    ? checklistItems.map(i => i.text).join(' ')
    : content;
  const charCount = textForCount.length;
  const wordCount = textForCount.trim() ? textForCount.trim().split(/\s+/).length : 0;

  // Auto-save whenever the user leaves this screen (back arrow, hardware back, swipe, etc.)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return; // already saved explicitly, allow navigation
      const d = noteDataRef.current;
      const finalContent = d.isChecklist ? serializeChecklistItems(d.checklistItems || []) : d.content;
      if (!d.title && !finalContent && (!d.images || d.images.length === 0) && !d.audioUri) return;

      e.preventDefault();
      isSavingRef.current = true;

      saveNote({
        id: noteIdFinal, title: d.title, content: finalContent, color: d.color,
        isFavorite: d.isFavorite, isPinned: d.isPinned,
        isHidden: hiddenFlag, images: d.images, audio: d.audioUri,
        selfDestructAt: d.selfDestructAt, isChecklist: d.isChecklist, notePassword: d.notePassword,
        reminder: d.reminderAt, reminderNotifId: d.reminderNotifId,
      }).then(() => {
        navigation.dispatch(e.data.action);
      }).catch((err) => {
        console.error('Auto-save failed:', err);
        isSavingRef.current = false;
        navigation.dispatch(e.data.action); // still allow navigation on failure
      });
    });
    return unsubscribe;
  }, [navigation, noteIdFinal, isFakeMode]);

  // Auto-save indicator
  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const handleSave = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const finalContent = isChecklist ? serializeChecklistItems(checklistItems) : content;
      // Schedule/reschedule reminder notification
      let notifId = reminderNotifId;
      if (reminderAt && Notifications) {
        if (notifId) { try { await Notifications.cancelScheduledNotificationAsync(notifId); } catch (_) {} }
        notifId = await Notifications.scheduleNotificationAsync({
          content: { title: 'NoteVault Reminder', body: title || 'You have a note reminder' },
          trigger: { type: 'date', date: new Date(reminderAt) },
        });
        setReminderNotifId(notifId);
      } else if (!reminderAt && notifId && Notifications) {
        try { await Notifications.cancelScheduledNotificationAsync(notifId); } catch (_) {}
        setReminderNotifId(null);
        notifId = null;
      }
      isSavingRef.current = true;
      await saveNote({
        id: noteIdFinal, title, content: finalContent, color, isFavorite, isPinned,
        isHidden: hiddenFlag, images, audio: audioUri,
        selfDestructAt, isChecklist, notePassword,
        reminder: reminderAt, reminderNotifId: notifId,
      });
      setSaved(true);
      navigation.goBack();
    } catch (err) {
      console.error('Save failed:', err);
      isSavingRef.current = false;
      Alert.alert('Save Error', 'Failed to save note. Please try again.');
    }
  };

  const handleTrash = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showConfirm(
      'Move to Trash',
      'This note will be moved to trash.',
      async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); isSavingRef.current = true; await moveNoteToTrash(noteIdFinal); navigation.goBack(); }
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) setImages([...images, result.assets[0].uri]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 });
    if (!result.canceled) setImages([...images, result.assets[0].uri]);
  };

  const removeImage = (idx) => { const arr = [...images]; arr.splice(idx, 1); setImages(arr); };

  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) { Alert.alert('Permission needed', 'Microphone permission is required.'); return; }
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      audioRecorder.record();
      setRecording(true);
    } catch (err) { console.error('startRecording error:', err); Alert.alert('Recording Error', err.message || 'Could not start recording.'); }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      const tempUri = audioRecorder.uri;
      if (tempUri) {
        const ext = tempUri.split('.').pop() || 'm4a';
        const destUri = `${FileSystem.documentDirectory}audio_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: tempUri, to: destUri });
        setAudioUri(destUri);
      }
    } catch (err) { console.error('stopRecording error:', err); }
    setRecording(false);
  };

  const stopProgressTimer = () => {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
  };

  const togglePlayback = () => {
    if (!audioPlayer) return;
    if (isAudioPlaying) {
      audioPlayer.pause();
      stopProgressTimer();
      setIsAudioPlaying(false);
    } else {
      audioPlayer.seekTo(0);
      audioPlayer.play();
      setIsAudioPlaying(true);
      progressIntervalRef.current = setInterval(() => {
        const cur = audioPlayer.currentTime ?? 0;
        const dur = audioPlayer.duration ?? 0;
        setAudioCurrentTime(cur);
        if (dur > 0) {
          setAudioDuration(dur);
          setAudioProgress(Math.min(cur / dur, 1));
        }
        if (dur > 0 && cur >= dur - 0.15) {
          stopProgressTimer();
          setIsAudioPlaying(false);
          setAudioProgress(0);
          setAudioCurrentTime(0);
        }
      }, 80);
    }
  };

  const exportToPDF = async () => {
    if (!title && !content && images.length === 0) { Alert.alert('Empty Note', 'Nothing to export.'); return; }
    try {
      // Convert attached images to base64 for embedding in PDF
      let imagesHtml = '';
      if (images.length > 0) {
        const imagePromises = images.map(async (imgUri) => {
          try {
            const base64 = await FileSystem.readAsStringAsync(imgUri, { encoding: FileSystem.EncodingType.Base64 });
            const ext = imgUri.split('.').pop().toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            return `<img src="data:${mime};base64,${base64}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`;
          } catch (_) {
            return ''; // skip if image can't be read
          }
        });
        const imageTags = await Promise.all(imagePromises);
        imagesHtml = `<div style="margin-top:16px">${imageTags.join('')}</div>`;
      }

      const html = `<html><body style="font-family:sans-serif;padding:24px">
        <h1 style="color:#4F46E5;margin-bottom:8px">${title || 'Untitled'}</h1>
        <p style="white-space:pre-wrap;font-size:16px;line-height:1.6;color:#333">${content || ''}</p>
        ${imagesHtml}
        ${audioUri ? '<p style="color:#4F46E5;font-size:13px;margin-top:12px">This note has a voice recording (audio cannot be embedded in PDF)</p>' : ''}
        <br/><footer style="color:gray;font-size:12px">Exported from NoteVault</footer>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Share or Save Note',
      });
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Error', 'Failed to export PDF.');
    }
  };

  // Default bg — no page coloring, color is for text now
  const bgColor = isDark ? t.surface : t.background;
  const textColor = color || t.textSecondary;

  // Animated keyboard padding — smooth slide up/down
  const kbAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animTo = (h) => Animated.timing(kbAnim, {
      toValue: h,
      duration: 280,
      useNativeDriver: false,
    }).start();
    const show = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      e => animTo(e.endCoordinates.height + 8)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => animTo(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      <Animated.View style={{ flex: 1, paddingBottom: kbAnim }}>

        {/* ─── Header ─── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Feather name="arrow-left" size={22} color={t.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: t.textPrimary }]}>
            {noteId ? 'Edit Note' : 'New Note'}
          </Text>
          <View style={styles.headerRight}>
            {saved && (
              <View style={styles.savedBadge}>
                <Feather name="check" size={12} color={t.primary} />
                <Text style={[styles.savedText, { color: t.primary }]}>Saved</Text>
              </View>
            )}
            {noteId && (
              <TouchableOpacity onPress={handleTrash} style={styles.headerBtn}>
                <Feather name="trash-2" size={20} color={t.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ─── Content ─── */}
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={[styles.titleInput, { color: t.textPrimary, fontSize: fontSizeMap.titleInput }]}
            placeholder="Note title"
            placeholderTextColor={t.textMuted}
            value={title}
            onChangeText={setTitle}
            multiline
          />

          {/* Self-destruct badge */}
          {selfDestructAt && (
            <View style={[styles.selfDestructBadge, { backgroundColor: t.dangerLight }]}>
              <Feather name="clock" size={13} color={t.danger} />
              <Text style={[styles.selfDestructText, { color: t.danger }]}>Auto-deletes: {new Date(selfDestructAt).toLocaleString()}</Text>
            </View>
          )}

          {/* Checklist mode */}
          {isChecklist ? (
            <View style={styles.checklistContainer}>
              {checklistItems.map((item, i) => (
                <View key={i} style={styles.checklistRow}>
                  <TouchableOpacity onPress={() => {
                    const items = [...checklistItems];
                    items[i] = { ...items[i], checked: !items[i].checked };
                    setChecklistItems(items);
                  }}>
                    <Feather
                      name={item.checked ? 'check-square' : 'square'}
                      size={20}
                      color={item.checked ? t.primary : t.textMuted}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={[
                      styles.checklistInput,
                      { color: textColor, fontSize: fontSizeMap.bodyInput },
                      item.checked && { textDecorationLine: 'line-through', opacity: 0.5 },
                    ]}
                    value={item.text}
                    onChangeText={(text) => {
                      const items = [...checklistItems];
                      items[i] = { ...items[i], text };
                      setChecklistItems(items);
                    }}
                    placeholder="List item..."
                    placeholderTextColor={t.textMuted}
                  />
                  <TouchableOpacity onPress={() => {
                    if (checklistItems.length <= 1) return;
                    setChecklistItems(checklistItems.filter((_, idx) => idx !== i));
                  }} style={{ padding: 4 }}>
                    <Feather name="x" size={16} color={t.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => setChecklistItems([...checklistItems, { checked: false, text: '' }])}
                style={styles.checklistAdd}>
                <Feather name="plus" size={18} color={t.primary} />
                <Text style={[styles.checklistAddText, { color: t.primary }]}>Add item</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TextInput
              style={[styles.bodyInput, { color: textColor, fontSize: fontSizeMap.bodyInput }]}
              placeholder="Start writing..."
              placeholderTextColor={t.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          )}

          {/* Images */}
          {images.length > 0 && (
            <View style={styles.imagesRow}>
              {images.map((uri, i) => (
                <View key={i} style={styles.imageWrap}>
                  <Image source={{ uri }} style={styles.imageThumb} />
                  <TouchableOpacity style={[styles.imageRemove, { backgroundColor: t.danger }]} onPress={() => removeImage(i)}>
                    <Feather name="x" size={10} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Audio Player */}
          {audioUri && (
            <View style={[styles.audioCard, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={styles.audioCardTop}>
                <View style={[styles.audioIconBox, { backgroundColor: t.primaryLight }]}>
                  <Feather name="mic" size={16} color={t.primary} />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={[styles.audioLabel, { color: t.textPrimary }]}>Voice Note</Text>
                  <Text style={[styles.audioTimeText, { color: t.textMuted }]}>
                    {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration || (audioPlayer?.duration ?? 0))}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={togglePlayback}
                  style={[styles.audioPlayCircle, { backgroundColor: t.primary }]}
                >
                  <Ionicons name={isAudioPlaying ? 'pause' : 'play'} size={13} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { audioPlayer?.pause(); stopProgressTimer(); setIsAudioPlaying(false); setAudioUri(null); setAudioProgress(0); setAudioCurrentTime(0); }}
                  style={{ padding: 8, marginLeft: 6 }}
                >
                  <Feather name="trash-2" size={16} color={t.danger} />
                </TouchableOpacity>
              </View>
              {/* Progress timeline */}
              <View style={[styles.audioProgressTrack, { backgroundColor: t.border }]}>
                <View style={[styles.audioProgressFill, { backgroundColor: t.primary, width: `${audioProgress * 100}%` }]} />
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Word / Character count */}
        <View style={[styles.wordCountBar, { borderTopColor: t.border, backgroundColor: isDark ? t.card : t.surface }]}>
          <Text style={[styles.wordCharCount, { color: t.textMuted }]}>
            {wordCount} word{wordCount !== 1 ? 's' : ''} · {charCount} char{charCount !== 1 ? 's' : ''}
          </Text>
          <View style={styles.undoRedoGroup}>
            <TouchableOpacity
              onPress={handleUndo}
              style={[styles.undoRedoBtn, { opacity: undoStack.current.length > 0 ? 1 : 0.3 }]}
              disabled={undoStack.current.length === 0}
            >
              <Feather name="corner-up-left" size={16} color={t.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRedo}
              style={[styles.undoRedoBtn, { opacity: redoStack.current.length > 0 ? 1 : 0.3 }]}
              disabled={redoStack.current.length === 0}
            >
              <Feather name="corner-up-right" size={16} color={t.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Bottom Toolbar ─── */}
        <View style={[styles.toolbar, { backgroundColor: isDark ? t.card : t.surface, borderTopColor: t.border }]}>
          {/* Text color picker row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow} contentContainerStyle={{ alignItems: 'center' }}>
            <Feather name="edit-3" size={15} color={t.textMuted} style={{ marginRight: 8 }} />
            {noteColors.map((c) => {
              const isDefault = c.value === null;
              const isActive = color === c.value;
              return (
                <TouchableOpacity
                  key={c.name}
                  onPress={() => setColor(c.value)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: isDefault ? t.surface : c.value },
                    isDefault && { borderWidth: 1.5, borderColor: t.border },
                    isActive && { borderWidth: 2.5, borderColor: t.textPrimary },
                  ]}
                >
                  {isActive && <Feather name="check" size={12} color={isDefault ? t.textPrimary : '#FFF'} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Feature row */}
          <View style={styles.featureRow}>
            <TouchableOpacity
              onPress={() => setIsChecklist(!isChecklist)}
              style={[styles.featureBtn, { backgroundColor: isChecklist ? t.primaryLight : t.background }]}
            >
              <Feather name="check-square" size={16} color={isChecklist ? t.primary : t.textMuted} />
              <Text style={[styles.featureBtnText, { color: isChecklist ? t.primary : t.textMuted }]}>Checklist</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTimerModal(true)}
              style={[styles.featureBtn, { backgroundColor: selfDestructAt ? t.dangerLight : t.background }]}
            >
              <Feather name="clock" size={16} color={selfDestructAt ? t.danger : t.textMuted} />
              <Text style={[styles.featureBtnText, { color: selfDestructAt ? t.danger : t.textMuted }]}>Timer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setReminderModal(true)}
              style={[styles.featureBtn, { backgroundColor: reminderAt ? t.primaryLight : t.background }]}
            >
              <Feather name="bell" size={16} color={reminderAt ? t.primary : t.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPasswordSetInput(notePassword || ''); setPasswordSetModal(true); }}
              style={[styles.featureBtn, { backgroundColor: notePassword ? t.warningLight : t.background }]}
            >
              <Feather name="lock" size={16} color={notePassword ? t.warning : t.textMuted} />
              <Text style={[styles.featureBtnText, { color: notePassword ? t.warning : t.textMuted }]}>{notePassword ? 'Locked' : 'Lock'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const cursor = content.length;
                setContent(content + '**bold** ');
              }}
              style={[styles.featureBtn, { backgroundColor: t.background }]}
            >
              <Text style={[styles.featureBtnBold, { color: t.textMuted }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setContent(content + '*italic* ')}
              style={[styles.featureBtn, { backgroundColor: t.background }]}
            >
              <Text style={[styles.featureBtnItalic, { color: t.textMuted }]}>I</Text>
            </TouchableOpacity>
          </View>

          {/* Action buttons row */}
          <View style={styles.actionsRow}>
            <View style={styles.actionGroup}>
              <ToolBtn icon="camera" onPress={takePhoto} color={t.textSecondary} bg={t.background} />
              <ToolBtn icon="image" onPress={pickImage} color={t.textSecondary} bg={t.background} />
              <ToolBtn
                icon={recording ? 'square' : 'mic'}
                onPress={recording ? stopRecording : startRecording}
                color={recording ? '#FFF' : t.textSecondary}
                bg={recording ? t.danger : t.background}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: t.border }]} />

            <View style={styles.actionGroup}>
              <ToolBtn
                iconComponent={<MaterialIcons name="push-pin" size={18} color={isPinned ? t.primary : t.textMuted} />}
                onPress={() => setIsPinned(!isPinned)}
                bg={isPinned ? t.primaryLight : t.background}
              />
              <ToolBtn
                icon="star"
                onPress={() => setIsFavorite(!isFavorite)}
                color={isFavorite ? t.warning : t.textMuted}
                bg={isFavorite ? t.warningLight : t.background}
              />
              <ToolBtn icon="share" onPress={exportToPDF} color={t.textSecondary} bg={t.background} />
            </View>

            <View style={{ flex: 1 }} />

            {/* Save button */}
            <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: t.primary }]} activeOpacity={0.8}>
              <Feather name="check" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

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

      {/* Reminder Modal */}
      <Modal visible={reminderModal} transparent animationType="fade" onRequestClose={() => setReminderModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReminderModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>Set Reminder</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted }]}>Get notified about this note</Text>
            {[
              { label: 'In 30 minutes', ms: 30 * 60 * 1000 },
              { label: 'In 1 hour', ms: 60 * 60 * 1000 },
              { label: 'In 4 hours', ms: 4 * 60 * 60 * 1000 },
              { label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 },
              { label: 'In 1 week', ms: 7 * 24 * 60 * 60 * 1000 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.timerOption, { borderColor: t.border }]}
                onPress={() => {
                  setReminderAt(new Date(Date.now() + opt.ms).toISOString());
                  setReminderModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.timerOptionText, { color: t.textPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            {reminderAt && (
              <TouchableOpacity
                style={[styles.timerOption, { borderColor: t.border }]}
                onPress={() => { setReminderAt(null); setReminderModal(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.timerOptionText, { color: t.danger }]}>Remove Reminder</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Self-Destruct Timer Modal */}
      <Modal visible={timerModal} transparent animationType="fade" onRequestClose={() => setTimerModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTimerModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>Self-Destruct Timer</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted }]}>Note will auto-delete after the selected time</Text>
            {TIMER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.timerOption, { borderColor: t.border }]}
                onPress={() => {
                  if (opt.hours === 0) {
                    setSelfDestructAt(null);
                  } else {
                    const date = new Date(Date.now() + opt.hours * 3600000);
                    setSelfDestructAt(date.toISOString());
                  }
                  setTimerModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.timerOptionText, { color: opt.hours === 0 ? t.danger : t.textPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note Password Modal */}
      <Modal visible={passwordSetModal} transparent animationType="fade" onRequestClose={() => setPasswordSetModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPasswordSetModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>{notePassword ? 'Note Password' : 'Set Note Password'}</Text>
            <Text style={[styles.modalMessage, { color: t.textMuted }]}>Password-protect this note</Text>
            <TextInput
              style={[styles.pwdSetInput, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.background }]}
              value={passwordSetInput}
              onChangeText={setPasswordSetInput}
              placeholder="Enter password"
              placeholderTextColor={t.textMuted}
              secureTextEntry autoFocus
            />
            <View style={styles.modalBtns}>
              {notePassword && (
                <TouchableOpacity onPress={() => { setNotePassword(null); setPasswordSetModal(false); }} style={styles.modalBtn}>
                  <Text style={[styles.modalBtnText, { color: t.danger }]}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setPasswordSetModal(false)} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (passwordSetInput.length > 0) {
                  setNotePassword(passwordSetInput);
                  setPasswordSetModal(false);
                }
              }} style={styles.modalBtn}>
                <Text style={[styles.modalBtnText, { color: t.primary }]}>Set</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Small tool button component
function ToolBtn({ icon, iconComponent, onPress, color, bg }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.toolBtn, { backgroundColor: bg }]} activeOpacity={0.7}>
      {iconComponent || <Feather name={icon} size={18} color={color} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  headerBtn: { padding: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  savedBadge: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  savedText: { fontSize: 12, fontWeight: '600', marginLeft: 3 },
  // Body
  body: { flex: 1, paddingHorizontal: 20 },
  titleInput: { fontSize: 24, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  bodyInput: { fontSize: 16, lineHeight: 24, minHeight: 200 },
  // Images
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  imageWrap: { marginRight: 10, marginBottom: 10 },
  imageThumb: { width: 100, height: 100, borderRadius: 12 },
  imageRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  // Audio player card
  audioCard: {
    borderRadius: 14, borderWidth: 1, marginTop: 12, overflow: 'hidden',
  },
  audioCardTop: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10,
  },
  audioIconBox: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  audioLabel: { fontSize: 13, fontWeight: '700' },
  audioTimeText: { fontSize: 11, marginTop: 2 },
  audioPlayCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  audioProgressTrack: {
    height: 3, width: '100%',
  },
  audioProgressFill: {
    height: 3,
  },
  // Toolbar
  toolbar: {
    borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  colorRow: { marginBottom: 16 },
  // Word count bar (above toolbar)
  wordCountBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth },
  wordCharCount: { fontSize: 11, fontWeight: '500' },
  undoRedoGroup: { flexDirection: 'row', alignItems: 'center' },
  undoRedoBtn: { padding: 6, marginLeft: 4 },
  // Feature row
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, gap: 6 },
  featureBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  featureBtnText: { fontSize: 12, fontWeight: '600', marginLeft: 5 },
  featureBtnBold: { fontSize: 16, fontWeight: '900' },
  featureBtnItalic: { fontSize: 16, fontStyle: 'italic', fontWeight: '600' },
  // Self-destruct
  selfDestructBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 12 },
  selfDestructText: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
  // Checklist
  checklistContainer: { marginTop: 4 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  checklistInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  checklistAdd: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checklistAddText: { marginLeft: 8, fontSize: 14, fontWeight: '600' },
  // Timer modal
  timerOption: { paddingVertical: 14, borderBottomWidth: 1 },
  timerOptionText: { fontSize: 15, fontWeight: '600' },
  // Password set
  pwdSetInput: { fontSize: 16, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  colorDot: {
    width: 26, height: 26, borderRadius: 13, marginRight: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  actionGroup: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 26, marginHorizontal: 8, opacity: 0.5 },
  toolBtn: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 3,
  },
  saveBtn: {
    width: 44, height: 44, borderRadius: 14,
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
});
