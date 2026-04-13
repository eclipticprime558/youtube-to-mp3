import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Clipboard, ScrollView, Platform,
} from "react-native";
import * as ExpoClipboard from "expo-clipboard";
import { startConvert, pollJobStatus, listJobs, Job } from "../api";

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

export default function ConvertScreen() {
  const [url, setUrl]             = useState("");
  const [converting, setConverting] = useState(false);
  const [job, setJob]             = useState<Job | null>(null);
  const [history, setHistory]     = useState<Job[]>([]);
  const cancelRef                 = useRef<(() => void) | null>(null);

  // Load recent jobs on mount
  useEffect(() => {
    listJobs()
      .then(jobs => setHistory(jobs.slice(0, 20)))
      .catch(() => {});
  }, []);

  // Watch clipboard for YouTube URLs when screen is focused
  useEffect(() => {
    const check = async () => {
      try {
        const text = await ExpoClipboard.getStringAsync();
        if (text && (text.includes("youtube.com/") || text.includes("youtu.be/")) && text !== url) {
          setUrl(text);
        }
      } catch {}
    };
    check();
  }, []);

  const handleConvert = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (converting) return;

    setConverting(true);
    setJob(null);

    try {
      const { job_id } = await startConvert(trimmed);
      const stop = pollJobStatus(
        job_id,
        (j) => setJob(j),
        (j) => {
          setJob(j);
          setConverting(false);
          setUrl("");
          setHistory(prev => [j, ...prev.slice(0, 19)]);
        },
        (msg) => {
          setJob(prev => prev ? { ...prev, status: "error", error: msg } : null);
          setConverting(false);
        }
      );
      cancelRef.current = stop;
    } catch (e: any) {
      setJob({ id: "", url: trimmed, status: "error", progress: 0,
               filename: null, filenames: [], title: null,
               error: e.message, speed: "", eta: "" });
      setConverting(false);
    }
  };

  const progressColor = job?.status === "error" ? C.warn :
                        job?.status === "complete" ? C.success : C.accent;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>YouTube <Text style={styles.headingAccent}>→ MP3</Text></Text>
      <Text style={styles.subheading}>Paste a URL to start converting</Text>

      {/* URL Input */}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="Paste YouTube URL here…"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={handleConvert}
          editable={!converting}
        />
        <TouchableOpacity
          style={[styles.btn, converting && styles.btnDisabled]}
          onPress={handleConvert}
          disabled={converting}
        >
          {converting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.btnText}>Convert</Text>}
        </TouchableOpacity>
      </View>

      {/* Progress */}
      {job && (
        <View style={styles.card}>
          <Text style={styles.jobTitle} numberOfLines={2}>
            {job.title || job.url}
          </Text>

          {/* Progress bar */}
          <View style={styles.barWrap}>
            <View style={[styles.barFill, { width: `${job.progress}%` as any, backgroundColor: progressColor }]} />
          </View>

          <View style={styles.progressMeta}>
            <Text style={[styles.statusText, { color: progressColor }]}>
              {job.status === "downloading" ? "Downloading…"
               : job.status === "converting" ? "Converting to MP3…"
               : job.status === "complete"   ? "Done!"
               : job.status === "error"      ? "Error"
               : "Queued…"}
            </Text>
            {job.speed ? (
              <Text style={styles.metaRight}>{job.speed}  ETA {job.eta}</Text>
            ) : null}
          </View>

          {job.status === "error" && (
            <Text style={styles.errorText}>{job.error}</Text>
          )}
          {job.status === "complete" && job.filename && (
            <Text style={styles.filenameText}>{job.filename}</Text>
          )}
        </View>
      )}

      {/* History */}
      {history.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {history.map((h, i) => (
            <View key={h.id || i} style={[styles.histRow, i < history.length - 1 && styles.histBorder]}>
              <View style={[styles.histIcon,
                h.status === "complete" ? styles.histIconOk :
                h.status === "error"    ? styles.histIconErr : styles.histIconSpin]}>
                <Text style={styles.histIconText}>
                  {h.status === "complete" ? "✓" : h.status === "error" ? "!" : "↻"}
                </Text>
              </View>
              <View style={styles.histInfo}>
                <Text style={styles.histName} numberOfLines={1}>{h.title || h.url}</Text>
                <Text style={styles.histMeta} numberOfLines={1}>
                  {h.status === "complete" ? h.filename || "done" : h.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20, paddingBottom: 40 },

  heading:       { fontSize: 26, fontWeight: "700", color: C.text, textAlign: "center", marginTop: 10 },
  headingAccent: { color: C.accent },
  subheading:    { fontSize: 13, color: C.muted, textAlign: "center", marginTop: 4, marginBottom: 24 },

  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },

  input: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    color: C.text,
    fontSize: 14,
    padding: 12,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  jobTitle:  { color: C.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  barWrap:   { backgroundColor: C.bg, borderRadius: 99, height: 7, overflow: "hidden", marginBottom: 8 },
  barFill:   { height: "100%", borderRadius: 99 },
  progressMeta: { flexDirection: "row", justifyContent: "space-between" },
  statusText: { fontSize: 12, fontWeight: "600" },
  metaRight:  { fontSize: 12, color: C.muted },
  errorText:  { color: C.warn, fontSize: 12, marginTop: 6 },
  filenameText: { color: C.muted, fontSize: 11, marginTop: 4 },

  sectionTitle: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.muted, marginBottom: 10 },

  histRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 9, gap: 10 },
  histBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  histIcon:  { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  histIconOk:  { backgroundColor: "rgba(67,160,71,0.15)" },
  histIconErr: { backgroundColor: "rgba(251,140,0,0.15)" },
  histIconSpin:{ backgroundColor: "rgba(229,57,53,0.12)" },
  histIconText:{ fontSize: 12 },
  histInfo:  { flex: 1 },
  histName:  { color: C.text, fontSize: 13 },
  histMeta:  { color: C.muted, fontSize: 11, marginTop: 2 },
});
