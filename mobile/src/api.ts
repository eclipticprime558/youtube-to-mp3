import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_PORT = 5000;
const SERVER_KEY = "@ytmp3_server";

// ─── Config ─────────────────────────────────────────────────────────────────

export interface ServerConfig {
  host: string;
  port: number;
}

export async function getServerConfig(): Promise<ServerConfig> {
  const raw = await AsyncStorage.getItem(SERVER_KEY);
  if (raw) return JSON.parse(raw);
  return { host: "", port: DEFAULT_PORT };
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  await AsyncStorage.setItem(SERVER_KEY, JSON.stringify(config));
}

function baseUrl(config: ServerConfig): string {
  const host = config.host.trim().replace(/\/$/, "");
  if (!host) throw new Error("Server address not set. Go to Settings.");
  // Allow host:port shorthand
  if (host.includes(":")) return `http://${host}`;
  return `http://${host}:${config.port}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  url: string;
  status: "queued" | "downloading" | "converting" | "complete" | "error";
  progress: number;
  filename: string | null;
  filenames: string[];
  title: string | null;
  error: string | null;
  speed: string;
  eta: string;
}

export interface RemoteFile {
  name: string;
  size: number;
  modified: number;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function startConvert(url: string): Promise<{ job_id: string }> {
  const config = await getServerConfig();
  const res = await fetch(`${baseUrl(config)}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getJobStatus(jobId: string): Promise<Job> {
  const config = await getServerConfig();
  const res = await fetch(`${baseUrl(config)}/status/${jobId}`);
  return res.json();
}

export async function listJobs(): Promise<Job[]> {
  const config = await getServerConfig();
  const res = await fetch(`${baseUrl(config)}/jobs`);
  return res.json();
}

export async function listFiles(): Promise<RemoteFile[]> {
  const config = await getServerConfig();
  const res = await fetch(`${baseUrl(config)}/files`);
  return res.json();
}

export async function getDownloadUrl(filename: string): Promise<string> {
  const config = await getServerConfig();
  return `${baseUrl(config)}/download/${encodeURIComponent(filename)}`;
}

export async function checkServer(): Promise<{ name: string; ip: string; port: number }> {
  const config = await getServerConfig();
  const res = await fetch(`${baseUrl(config)}/info`, { signal: AbortSignal.timeout(5000) });
  return res.json();
}

// ─── SSE polling fallback (React Native has no EventSource) ──────────────────
// We poll /status every second while in-progress.

export function pollJobStatus(
  jobId: string,
  onUpdate: (job: Job) => void,
  onDone: (job: Job) => void,
  onError: (msg: string) => void
): () => void {
  let cancelled = false;
  let intervalMs = 800;

  const poll = async () => {
    if (cancelled) return;
    try {
      const job = await getJobStatus(jobId);
      onUpdate(job);
      if (job.status === "complete") { onDone(job); return; }
      if (job.status === "error")    { onError(job.error || "Unknown error"); return; }
      setTimeout(poll, intervalMs);
    } catch {
      if (!cancelled) setTimeout(poll, 2000);
    }
  };

  poll();
  return () => { cancelled = true; };
}
