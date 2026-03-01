import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, TextInput, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../theme/ThemeContext';
import {
  getAppPin, setAppPin, getFakePin, setFakePin,
  getAllNotes, deleteAllNotes, getNotesCount, getTrashCount,
  getSecurityLogs, clearSecurityLogs, getDeepVaultPassword, setDeepVaultPassword,
} from '../storage/database';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme, fontSize, updateFontSize, autoLockSeconds, updateAutoLock, shakeToLock, updateShakeToLock, biometricEnabled, updateBiometric } = useTheme();
  const t = theme;

  const [notesCount, setNotesCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [deepVaultModal, setDeepVaultModal] = useState(false);
  const [deepVaultInput, setDeepVaultInput] = useState('');
  const [deepVaultCurrent, setDeepVaultCurrent] = useState(null);

  // PIN modal state
  const [pinModal, setPinModal] = useState(false);
  const [pinType, setPinType] = useState('change'); // 'change' | 'fake'
  const [pinStep, setPinStep] = useState(0); // 0 = verify old, 1 = enter new, 2 = confirm new
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) =>
    setConfirmModal({ visible: true, title, message, onConfirm });
  const hideConfirm = () =>
    setConfirmModal(m => ({ ...m, visible: false, onConfirm: null }));

  // Auto-lock cycle: Off → 30s → 1min → 5min → Off
  const AUTO_LOCK_OPTIONS = [0, 30, 60, 300];
  const autoLockLabel = autoLockSeconds === 0 ? 'Off' : autoLockSeconds === 30 ? '30 sec' : autoLockSeconds === 60 ? '1 min' : '5 min';
  const cycleAutoLock = () => {
    const idx = AUTO_LOCK_OPTIONS.indexOf(autoLockSeconds);
    updateAutoLock(AUTO_LOCK_OPTIONS[(idx + 1) % AUTO_LOCK_OPTIONS.length]);
  };

  // Font size cycle: Small → Medium → Large → Small
  const FONT_OPTIONS = ['small', 'medium', 'large'];
  const fontSizeLabel = fontSize.charAt(0).toUpperCase() + fontSize.slice(1);
  const cycleFontSize = () => {
    const idx = FONT_OPTIONS.indexOf(fontSize);
    updateFontSize(FONT_OPTIONS[(idx + 1) % FONT_OPTIONS.length]);
  };

  // Security log helpers
  const logIcon = (type) => {
    switch (type) {
      case 'pin_unlock': return 'unlock';
      case 'fake_pin_unlock': return 'eye-off';
      case 'failed_attempt': return 'alert-triangle';
      case 'biometric_unlock': return 'smartphone';
      default: return 'activity';
    }
  };
  const logLabel = (type) => {
    switch (type) {
      case 'pin_unlock': return 'PIN Unlock';
      case 'fake_pin_unlock': return 'Fake PIN Used';
      case 'failed_attempt': return 'Failed Attempt';
      case 'biometric_unlock': return 'Biometric Unlock';
      default: return type;
    }
  };
  const handleClearLogs = () => {
    showConfirm('Clear Security Log', 'This will permanently delete all security log entries.', async () => {
      await clearSecurityLogs();
      setSecurityLogs([]);
    });
  };
  const handleSaveVaultPassword = async () => {
    if (deepVaultInput.length < 4) { Alert.alert('Error', 'Password must be at least 4 characters.'); return; }
    await setDeepVaultPassword(deepVaultInput);
    setDeepVaultCurrent(deepVaultInput);
    setDeepVaultInput('');
    setDeepVaultModal(false);
    Alert.alert('Success', 'Deep Vault password saved.');
  };
  const handleRemoveVaultPassword = async () => {
    await setDeepVaultPassword('');
    setDeepVaultCurrent(null);
    setDeepVaultInput('');
    setDeepVaultModal(false);
    Alert.alert('Removed', 'Deep Vault password removed.');
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setNotesCount(await getNotesCount());
        setTrashCount(await getTrashCount());
        setSecurityLogs(await getSecurityLogs(20));
        setDeepVaultCurrent(await getDeepVaultPassword());
      })();
    }, [])
  );

  // ─── PIN Change Logic ───
  const openChangePinModal = () => {
    setPinType('change');
    setPinStep(0);
    setOldPin(''); setNewPin(''); setConfirmPin('');
    setPinModal(true);
  };

  const openFakePinModal = () => {
    setPinType('fake');
    setPinStep(1); // skip verify for fake PIN
    setOldPin(''); setNewPin(''); setConfirmPin('');
    setPinModal(true);
  };

  const handlePinSubmit = async () => {
    if (pinType === 'change') {
      if (pinStep === 0) {
        // Verify old PIN
        const current = await getAppPin();
        if (oldPin !== current) { Alert.alert('Error', 'Current PIN is incorrect.'); return; }
        setPinStep(1);
      } else if (pinStep === 1) {
        if (newPin.length !== 4) { Alert.alert('Error', 'PIN must be 4 digits.'); return; }
        setPinStep(2);
      } else {
        if (newPin !== confirmPin) { Alert.alert('Error', 'PINs do not match.'); return; }
        await setAppPin(newPin);
        Alert.alert('Success', 'PIN updated successfully.');
        setPinModal(false);
      }
    } else {
      // Fake PIN
      if (pinStep === 1) {
        if (newPin.length !== 4) { Alert.alert('Error', 'PIN must be 4 digits.'); return; }
        const realPin = await getAppPin();
        if (newPin === realPin) { Alert.alert('Error', 'Fake PIN cannot be the same as your real PIN.'); return; }
        setPinStep(2);
      } else {
        if (newPin !== confirmPin) { Alert.alert('Error', 'PINs do not match.'); return; }
        await setFakePin(newPin);
        Alert.alert('Success', 'Fake PIN set. Use it to show an empty vault.');
        setPinModal(false);
      }
    }
  };

  // ─── Export All Notes ───
  const handleExportAll = async () => {
    const notes = await getAllNotes();
    if (notes.length === 0) { Alert.alert('No Notes', 'Nothing to export.'); return; }

    const noteBlocks = await Promise.all(notes.map(async (n) => {
      // Convert images to base64
      let imagesHtml = '';
      try {
        const imgs = JSON.parse(n.images) || [];
        if (imgs.length > 0) {
          const tags = await Promise.all(imgs.map(async (imgUri) => {
            try {
              const base64 = await FileSystem.readAsStringAsync(imgUri, { encoding: FileSystem.EncodingType.Base64 });
              const ext = imgUri.split('.').pop().toLowerCase();
              const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
              return `<img src="data:${mime};base64,${base64}" style="max-width:100%;height:auto;border-radius:8px;margin:6px 0" />`;
            } catch (_) { return ''; }
          }));
          imagesHtml = tags.join('');
        }
      } catch (_) {}

      return `
        <div style="margin-bottom:24px;border-bottom:1px solid #eee;padding-bottom:16px">
          <h2 style="color:#4F46E5;margin:0 0 8px">${n.title || 'Untitled'}</h2>
          <p style="white-space:pre-wrap;color:#333;line-height:1.5">${n.content || ''}</p>
          ${imagesHtml}
          <small style="color:#999">${n.timestamp || ''}</small>
        </div>`;
    }));

    const html = `<html><body style="font-family:sans-serif;padding:24px">
      <h1 style="color:#4F46E5;margin-bottom:24px">NoteVault Export — ${notes.length} Notes</h1>
      ${noteBlocks.join('')}
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Share or Save Notes',
      });
    } catch (e) { Alert.alert('Error', 'Failed to export.'); }
  };

  // ─── Delete All Notes ───
  const handleDeleteAll = () => {
    showConfirm(
      'Delete All Notes',
      'This will permanently delete ALL notes — including trash. This cannot be undone.',
      async () => {
        await deleteAllNotes();
        setNotesCount(0);
        setTrashCount(0);
      }
    );
  };

  // ─── Render ───
  const SettingItem = ({ title, subtitle, icon, onPress, destructive, isAction, isSwitch, switchValue, onSwitchChange }) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: t.card }]}
      onPress={onPress}
      disabled={isSwitch}
      activeOpacity={0.7}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconBox, { backgroundColor: destructive ? t.dangerLight : t.primaryLight }]}>
          <Feather name={icon} size={18} color={destructive ? t.danger : t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.settingTitle, { color: destructive ? t.danger : t.textPrimary }]}>{title}</Text>
          {subtitle ? <Text style={[styles.settingSubtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: t.border, true: t.primary }}
          thumbColor={t.card}
        />
      ) : isAction ? (
        <Feather name="chevron-right" size={18} color={t.textMuted} />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: t.textPrimary }]}>Settings</Text>
        <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: t.card, borderColor: t.border }]}>
          <Feather name={isDark ? 'sun' : 'moon'} size={18} color={t.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: t.primary }]}>
          <View style={styles.profileIcon}>
            <Feather name="shield" size={24} color={t.primary} />
          </View>
          <View>
            <Text style={styles.profileName}>NoteVault</Text>
            <Text style={styles.profileSub}>Private · Encrypted · Offline</Text>
          </View>
        </View>

        {/* Stats */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>OVERVIEW</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: t.primaryLight }]}>
                <Feather name="file-text" size={18} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: t.textPrimary }]}>Notes</Text>
                <Text style={[styles.settingSubtitle, { color: t.textMuted }]}>Active notes in your vault</Text>
              </View>
            </View>
            <Text style={[styles.statBadge, { color: t.primary, backgroundColor: t.primaryLight }]}>{notesCount}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: t.dangerLight }]}>
                <Feather name="trash-2" size={18} color={t.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: t.textPrimary }]}>Trash</Text>
                <Text style={[styles.settingSubtitle, { color: t.textMuted }]}>Notes waiting to be deleted</Text>
              </View>
            </View>
            <Text style={[styles.statBadge, { color: t.danger, backgroundColor: t.dangerLight }]}>{trashCount}</Text>
          </View>
        </View>

        {/* Security */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>SECURITY</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <SettingItem icon="key" title="Change PIN" subtitle="Update your 4-digit unlock code" isAction onPress={openChangePinModal} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="eye-off" title="Fake PIN" subtitle="Show empty vault with decoy PIN" isAction onPress={openFakePinModal} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="smartphone" title="Biometric Unlock" subtitle="Use fingerprint or face to unlock" isSwitch switchValue={biometricEnabled} onSwitchChange={updateBiometric} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="clock" title="Auto-Lock Timer" subtitle={`Lock after inactivity: ${autoLockLabel}`} isAction onPress={cycleAutoLock} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="zap" title="Shake to Lock" subtitle="Shake your phone to instantly lock" isSwitch switchValue={shakeToLock} onSwitchChange={updateShakeToLock} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="lock" title="Deep Vault Password" subtitle={deepVaultCurrent ? 'Password is set — tap to change' : 'Tap to set a password'} isAction onPress={() => { setDeepVaultInput(''); setDeepVaultModal(true); }} />
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <SettingItem icon={isDark ? 'moon' : 'sun'} title="Dark Mode" isSwitch switchValue={isDark} onSwitchChange={toggleTheme} />
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <SettingItem icon="type" title="Font Size" subtitle={`Current: ${fontSizeLabel}`} isAction onPress={cycleFontSize} />
        </View>

        {/* Data */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>DATA</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <SettingItem icon="download" title="Export All Notes" subtitle="Save all notes as a PDF" isAction onPress={handleExportAll} />
        </View>

        {/* Security Log */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>SECURITY LOG</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowLogs(v => !v)} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: t.primaryLight }]}>
                <Feather name="shield" size={18} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingTitle, { color: t.textPrimary }]}>Access History</Text>
                <Text style={[styles.settingSubtitle, { color: t.textMuted }]}>{securityLogs.length} recent events</Text>
              </View>
            </View>
            <Feather name={showLogs ? 'chevron-up' : 'chevron-down'} size={18} color={t.textMuted} />
          </TouchableOpacity>

          {showLogs && (
            <>
              {securityLogs.length === 0 ? (
                <Text style={[styles.logEmpty, { color: t.textMuted }]}>No security events recorded yet.</Text>
              ) : (
                securityLogs.map((log, idx) => (
                  <View key={log.id || idx}>
                    <View style={[styles.divider, { backgroundColor: t.border }]} />
                    <View style={styles.logRow}>
                      <Feather name={logIcon(log.event_type)} size={15} color={t.textMuted} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.logEvent, { color: t.textPrimary }]}>{logLabel(log.event_type)}</Text>
                        {log.details ? <Text style={[styles.logDetails, { color: t.textMuted }]}>{log.details}</Text> : null}
                      </View>
                      <Text style={[styles.logTime, { color: t.textMuted }]}>
                        {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              {securityLogs.length > 0 && (
                <>
                  <View style={[styles.divider, { backgroundColor: t.border }]} />
                  <TouchableOpacity style={styles.logClearBtn} onPress={handleClearLogs} activeOpacity={0.7}>
                    <Feather name="trash-2" size={14} color={t.danger} />
                    <Text style={[styles.logClearText, { color: t.danger }]}>Clear Log</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>

        {/* Danger */}
        <Text style={[styles.sectionTitle, { color: t.textMuted }]}>DANGER ZONE</Text>
        <View style={[styles.cardGroup, { backgroundColor: t.card, borderColor: t.border }]}>
          <SettingItem icon="trash-2" title="Delete All Notes" subtitle="Permanently remove everything" destructive isAction onPress={handleDeleteAll} />
        </View>

        <Text style={[styles.version, { color: t.textMuted }]}>NoteVault · v1.0.0</Text>
      </ScrollView>

      {/* ─── PIN Modal ─── */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPinModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>
              {pinType === 'change' ? 'Change PIN' : 'Set Fake PIN'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: t.textMuted }]}>
              {pinType === 'change' && pinStep === 0
                ? 'Enter your current PIN'
                : pinStep === 1
                ? 'Enter new PIN (4 digits)'
                : 'Confirm new PIN'}
            </Text>
            <TextInput
              key={`pin-${pinStep}`}
              style={[styles.pinInput, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.background }]}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
              value={pinStep === 0 ? oldPin : pinStep === 1 ? newPin : confirmPin}
              selection={{ start: (pinStep === 0 ? oldPin : pinStep === 1 ? newPin : confirmPin).length, end: (pinStep === 0 ? oldPin : pinStep === 1 ? newPin : confirmPin).length }}
              onChangeText={(val) => {
                if (pinStep === 0) setOldPin(val);
                else if (pinStep === 1) setNewPin(val);
                else setConfirmPin(val);
              }}
              placeholder="····"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.pinModalBtns}>
              <TouchableOpacity onPress={() => setPinModal(false)} style={[styles.pinModalBtn, { backgroundColor: t.background }]}>
                <Text style={[styles.pinModalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePinSubmit} style={[styles.pinModalBtn, { backgroundColor: t.primary }]}>
                <Text style={[styles.pinModalBtnText, { color: '#FFF' }]}>
                  {(pinType === 'change' && pinStep < 2) || (pinType === 'fake' && pinStep < 2) ? 'Next' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete All Confirm Modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={hideConfirm}>
        <Pressable style={styles.modalOverlay} onPress={hideConfirm}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>{confirmModal.title}</Text>
            <Text style={[styles.modalSubtitle, { color: t.textSecondary, opacity: 0.8, lineHeight: 21, marginBottom: 24 }]}>{confirmModal.message}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={hideConfirm} style={styles.modalBtn} activeOpacity={0.6}>
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { const fn = confirmModal.onConfirm; hideConfirm(); fn && fn(); }}
                style={styles.modalBtn}
                activeOpacity={0.6}
              >
                <Text style={[styles.modalBtnText, { color: t.danger }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Deep Vault Password Modal */}
      <Modal visible={deepVaultModal} transparent animationType="fade" onRequestClose={() => setDeepVaultModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDeepVaultModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.textPrimary }]}>
              {deepVaultCurrent ? 'Change Deep Vault Password' : 'Set Deep Vault Password'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: t.textMuted }]}>
              Triple-tap the NoteVault title on Home to open the Deep Vault.
            </Text>
            <TextInput
              style={[styles.vaultPwdInput, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.background }]}
              secureTextEntry
              autoFocus
              value={deepVaultInput}
              onChangeText={setDeepVaultInput}
              placeholder="Enter password (min 4 chars)"
              placeholderTextColor={t.textMuted}
            />
            <View style={styles.vaultPwdBtns}>
              <TouchableOpacity onPress={() => setDeepVaultModal(false)} style={[styles.vaultPwdBtn, { backgroundColor: t.background }]}>
                <Text style={[styles.vaultPwdBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              {deepVaultCurrent ? (
                <TouchableOpacity onPress={handleRemoveVaultPassword} style={[styles.vaultPwdBtn, { backgroundColor: t.dangerLight }]}>
                  <Text style={[styles.vaultPwdBtnText, { color: t.danger }]}>Remove</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={handleSaveVaultPassword} style={[styles.vaultPwdBtn, { backgroundColor: t.primary }]}>
                <Text style={[styles.vaultPwdBtnText, { color: '#FFF' }]}>Save</Text>
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
  body: { flex: 1, paddingHorizontal: 20 },
  // Profile
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, borderRadius: 20, marginTop: 16, marginBottom: 20,
  },
  profileIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  profileName: { fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 2 },
  profileSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  // Stats badge
  statBadge: {
    fontSize: 15, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden',
  },
  // Sections
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginLeft: 4, marginTop: 4 },
  cardGroup: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  settingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginLeft: 66 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 8, marginBottom: 20 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  modalCard: { width: '100%', borderRadius: 28, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 12, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, marginBottom: 20 },
  pinInput: {
    fontSize: 30, fontWeight: '700', textAlign: 'center',
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 20,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  // PIN modal specific buttons (filled)
  pinModalBtns: { flexDirection: 'row', justifyContent: 'space-between' },
  pinModalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 4 },
  pinModalBtnText: { fontSize: 15, fontWeight: '700' },
  // Security Log
  logEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 16, paddingHorizontal: 16 },
  logRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  logEvent: { fontSize: 13, fontWeight: '600' },
  logDetails: { fontSize: 11, marginTop: 1 },
  logTime: { fontSize: 11, marginLeft: 8 },
  logClearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12,
  },
  logClearText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  // Deep Vault Password Modal
  vaultPwdInput: {
    fontSize: 16, borderWidth: 1, borderRadius: 14,
    padding: 14, marginBottom: 20,
  },
  vaultPwdBtns: { flexDirection: 'row', justifyContent: 'flex-end' },
  vaultPwdBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginLeft: 8 },
  vaultPwdBtnText: { fontSize: 14, fontWeight: '700' },
});
