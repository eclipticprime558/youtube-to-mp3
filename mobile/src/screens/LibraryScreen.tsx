import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { listFiles, getDownloadUrl, listDriveFiles, RemoteFile, DriveFile } from "../api";

const C = {
  bg:      "#0f0f0f",
  surface: "#1a1a1a",
  border:  "#2a2a2a",
  accent:  "#e53935",
  text:    "#f0f0f0",
  muted:   "#888",
  success: "#43a047",
  warn:    "#fb8c00",
};

const DOWNLOAD_DIR = FileSystem.documentDirectory + "mp3/";

interface LocalFile {
  name: string;
  uri: string;
  size: number;
}

type Tab = "drive" | "downloaded";

export default function LibraryScreen() {
  const [tab, setTab]               = useState<Tab>("drive");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const loadDriveFiles = useCallback(async () => {
    try {
      const files = await listDriveFiles();
      setDriveFiles(files);
    } catch (e: any) {
      Alert.alert("Connection error", e.message || "Could not reach server.");
    }
  }, []);

  const loadLocalFiles = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
      if (!info.exists) {
        setLocalFiles([]);
        return;
      }
      const names = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
      const files: LocalFile[] = await Promise.all(
        names
          .filter(n => n.toLowerCase().endsWith(".mp3"))
          .map(async name => {
            const uri = DOWNLOAD_DIR + name;
            const stat = await FileSystem.getInfoAsync(uri);
            return { name, uri, size: (stat as any).size || 0 };
          })
      );
      files.sort((a, b) => a.name.localeCompare(b.name));
      setLocalFiles(files);
    } catch {
      setLocalFiles([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadDriveFiles(), loadLocalFiles()]);
    setLoading(false);
  }, [loadDriveFiles, loadLocalFiles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  useEffect(() => { refresh(); }, []);

  const downloadFile = async (filename: string, sourceUrl?: string) => {
    setDownloading(filename);
    try {
      await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
      const url = sourceUrl || await getDownloadUrl(filename);
      const dest = DOWNLOAD_DIR + filename;
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists) {
        Alert.alert("Already downloaded", `"${filename}" is already saved to your phone.`);
        setDownloading(null);
        return;
      }
      const result = await FileSystem.downloadAsync(url, dest);
      if (result.status === 200) {
        await loadLocalFiles();
        Alert.alert("Downloaded!", `"${filename}" saved for offline playback.`);
      } else {
        Alert.alert("Download failed", `Server returned ${result.status}`);
      }
    } catch (e: any) {
      Alert.alert("Download error", e.message);
    } finally {
      setDownloading(null);
    }
  };

  const shareFile = async (uri: string, name: string) => {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing not available on this device.");
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: "audio/mpeg", dialogTitle: name });
  };

  const deleteLocalFile = (name: string, uri: string) => {
    Alert.alert("Delete file?", `Remove "${name}" from your phone?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        await loadLocalFiles();
      }},
    ]);
  };

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString();
  }

  const renderDriveFile = ({ item }: { item: DriveFile }) => (
    <View style={styles.fileRow}>
      <View style={[styles.fileIcon, { backgroundColor: "rgba(66,133,244,0.12)" }]}>
        <Text style={[styles.fileIconText, { color: "#4285f4" }]}>♪</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>{new Date(item.modifiedTime).toLocaleDateString()}  ·  Drive</Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, downloading === item.name && styles.actionBtnDisabled]}
        onPress={() => downloadFile(item.name, item.webContentLink)}
        disabled={downloading === item.name}
      >
        {downloading === item.name
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.actionBtnText}>↓</Text>}
      </TouchableOpacity>
    </View>
  );

  const renderLocalFile = ({ item }: { item: LocalFile }) => (
    <View style={styles.fileRow}>
      <View style={[styles.fileIcon, { backgroundColor: "rgba(67,160,71,0.15)" }]}>
        <Text style={[styles.fileIconText, { color: C.success }]}>♪</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>{formatBytes(item.size)}  ·  Offline</Text>
      </View>
      <TouchableOpacity style={styles.actionBtn} onPress={() => shareFile(item.uri, item.name)}>
        <Text style={styles.actionBtnText}>↑</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#2a1a1a", marginLeft: 6 }]}
        onPress={() => deleteLocalFile(item.name, item.uri)}>
        <Text style={[styles.actionBtnText, { color: C.warn }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const data = tab === "drive" ? driveFiles : localFiles;
  const empty = tab === "drive"
    ? "No MP3s in Google Drive yet.\nConvert a video first."
    : "No files downloaded yet.\nDownload from the Drive tab to play offline.";

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {(["drive", "downloaded"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "drive" ? `Drive  (${driveFiles.length})` : `Downloaded  (${localFiles.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />}

      <FlatList
        data={data as any[]}
        keyExtractor={(item) => item.name}
        renderItem={tab === "drive" ? renderDriveFile as any : renderLocalFile as any}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{empty}</Text> : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  tab:           { flex: 1, paddingVertical: 13, alignItems: "center" },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText:       { color: C.muted, fontSize: 13, fontWeight: "500" },
  tabTextActive: { color: C.text, fontWeight: "700" },

  list: { padding: 16, paddingBottom: 40 },

  fileRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fileIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "rgba(229,57,53,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  fileIconText: { fontSize: 16, color: C.accent },
  fileInfo:     { flex: 1 },
  fileName:     { color: C.text, fontSize: 13, fontWeight: "500" },
  fileMeta:     { color: C.muted, fontSize: 11, marginTop: 2 },

  actionBtn: {
    backgroundColor: C.accent,
    borderRadius: 7,
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  separator: { height: 1, backgroundColor: C.border, marginVertical: 8 },
  empty:     { color: C.muted, textAlign: "center", marginTop: 50, lineHeight: 22, fontSize: 14 },
});
