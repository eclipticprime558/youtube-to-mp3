import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { getServerConfig, saveServerConfig, checkServer, ServerConfig } from "../api";

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

export default function SettingsScreen() {
  const [host, setHost]       = useState("");
  const [port, setPort]       = useState("5000");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    getServerConfig().then(c => {
      setHost(c.host);
      setPort(String(c.port));
    });
  }, []);

  const save = async () => {
    const config: ServerConfig = { host: host.trim(), port: parseInt(port) || 5000 };
    await saveServerConfig(config);
    Alert.alert("Saved", "Server settings saved.");
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const info = await checkServer();
      setTestResult({ ok: true, msg: `Connected to "${info.name}" (${info.ip}:${info.port})` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "Could not connect" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      {/* Server address */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>PC Server Address</Text>
        <Text style={styles.hint}>
          On your PC, open the converter and click Settings to see your IP address.
          Make sure your phone and PC are on the same WiFi.
        </Text>

        <Text style={styles.label}>Host / IP address</Text>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder="e.g. 192.168.1.42"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>Port</Text>
        <TextInput
          style={[styles.input, { width: 100 }]}
          value={port}
          onChangeText={setPort}
          placeholder="5000"
          placeholderTextColor={C.muted}
          keyboardType="number-pad"
        />

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={save}>
            <Text style={styles.btnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={test} disabled={testing}>
            {testing
              ? <ActivityIndicator color={C.text} size="small" />
              : <Text style={styles.btnText}>Test Connection</Text>}
          </TouchableOpacity>
        </View>

        {testResult && (
          <View style={[styles.testResult, testResult.ok ? styles.testOk : styles.testErr]}>
            <Text style={{ color: testResult.ok ? C.success : C.warn, fontSize: 13 }}>
              {testResult.ok ? "✓ " : "✕ "}{testResult.msg}
            </Text>
          </View>
        )}
      </View>

      {/* VLC sync info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>VLC WiFi Sync Setup</Text>
        <Text style={styles.hint}>
          To browse your converted MP3s directly in VLC Mobile:
        </Text>
        <View style={styles.stepList}>
          {[
            "On your PC, right-click the Music\\VLC output folder → Properties → Sharing → Share it (give it a share name like \"Music\")",
            "Open VLC on your phone → tap Browse → tap Network → tap Windows Network",
            "Find your PC name → tap Music share → your MP3s appear instantly",
            "Tap any file to stream it, or hold to download for offline playback",
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* About */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>About</Text>
        <Text style={styles.hint}>YouTube → MP3 Converter v1.0</Text>
        <Text style={[styles.hint, { marginTop: 6 }]}>
          Conversion happens on your PC using yt-dlp + ffmpeg. This app is a remote control — your phone and PC must be on the same WiFi network.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20, paddingBottom: 50 },

  heading: { fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 20 },

  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 8 },
  hint:      { fontSize: 13, color: C.muted, lineHeight: 19 },

  label: { fontSize: 12, color: C.muted, marginTop: 12, marginBottom: 5 },
  input: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    color: C.text,
    fontSize: 14,
    padding: 11,
  },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  btnSecondary: { backgroundColor: C.border },
  btnText: { color: C.text, fontWeight: "700", fontSize: 14 },

  testResult: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
  },
  testOk:  { backgroundColor: "rgba(67,160,71,0.1)" },
  testErr: { backgroundColor: "rgba(251,140,0,0.1)" },

  stepList: { marginTop: 10, gap: 10 },
  step:     { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum:  {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(229,57,53,0.15)",
    alignItems: "center", justifyContent: "center",
    marginTop: 1, flexShrink: 0,
  },
  stepNumText: { color: C.accent, fontSize: 11, fontWeight: "700" },
  stepText:    { flex: 1, color: C.muted, fontSize: 13, lineHeight: 19 },
});
