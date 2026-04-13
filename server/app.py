import os
import json
import uuid
import queue
import threading
import subprocess
import sys
import mutagen.id3
from pathlib import Path

from flask import Flask, request, jsonify, Response, render_template, send_file
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app)


# ---------------------------------------------------------------------------
# ffmpeg auto-detection
# ---------------------------------------------------------------------------

def _find_ffmpeg() -> str | None:
    """Return path to ffmpeg bin folder, or None if not found."""
    # 1. Already on PATH
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return None  # None tells yt-dlp to use PATH
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    # 2. Common winget install location
    import glob
    winget_base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages")
    matches = glob.glob(os.path.join(winget_base, "Gyan.FFmpeg*", "**", "bin", "ffmpeg.exe"), recursive=True)
    if matches:
        return os.path.dirname(matches[0])

    # 3. Chocolatey
    choco = r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"
    if os.path.exists(choco):
        return os.path.dirname(choco)

    # 4. Common manual installs
    for p in [r"C:\ffmpeg\bin", r"C:\Program Files\ffmpeg\bin"]:
        if os.path.exists(os.path.join(p, "ffmpeg.exe")):
            return p

    return None  # not found


FFMPEG_LOCATION = _find_ffmpeg()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
DEFAULT_CONFIG = {
    "output_folder": str(Path.home() / "Music" / "VLC"),
    "port": 5000,
}


def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return {**DEFAULT_CONFIG, **json.load(f)}
    return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


# ---------------------------------------------------------------------------
# Job management
# ---------------------------------------------------------------------------

jobs: dict = {}          # job_id -> job dict
job_queues: dict = {}    # job_id -> queue.Queue  (SSE events)


def _get_queue(job_id: str) -> queue.Queue:
    if job_id not in job_queues:
        job_queues[job_id] = queue.Queue()
    return job_queues[job_id]


def _push(job_id: str, event: dict) -> None:
    _get_queue(job_id).put(event)


# ---------------------------------------------------------------------------
# Conversion worker
# ---------------------------------------------------------------------------

def _convert_worker(job_id: str, url: str, output_folder: str) -> None:
    job = jobs[job_id]
    track_state = {"index": 0, "total": 1, "track_title": ""}

    def progress_hook(d: dict) -> None:
        status = d.get("status")
        info  = d.get("info_dict", {})

        # Track playlist position from info_dict
        idx   = info.get("playlist_index") or info.get("playlist_autonumber") or track_state["index"]
        total = info.get("n_entries") or info.get("playlist_count") or track_state["total"]
        track_title = info.get("title", "")
        if idx:   track_state["index"] = idx
        if total: track_state["total"] = total
        if track_title: track_state["track_title"] = track_title

        if status == "downloading":
            tbytes = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            dbytes = d.get("downloaded_bytes", 0)
            # Per-track pct (capped at 90 until postprocess), then map into overall playlist pct
            track_pct = int(dbytes / tbytes * 90) if tbytes else 0
            if track_state["total"] > 1:
                done_tracks = track_state["index"] - 1
                overall_pct = int((done_tracks * 100 + track_pct) / track_state["total"])
            else:
                overall_pct = track_pct

            job.update(
                status="downloading",
                progress=overall_pct,
                speed=d.get("_speed_str", "").strip(),
                eta=d.get("_eta_str", "").strip(),
                track_index=track_state["index"],
                track_total=track_state["total"],
                track_title=track_state["track_title"],
            )
            _push(job_id, {
                "type": "progress",
                "progress": overall_pct,
                "speed": job["speed"],
                "eta": job["eta"],
                "status": "downloading",
                "track_index": track_state["index"],
                "track_total": track_state["total"],
                "track_title": track_state["track_title"],
            })

        elif status == "finished":
            if track_state["total"] > 1:
                done_tracks = track_state["index"] - 1
                overall_pct = int((done_tracks * 100 + 95) / track_state["total"])
            else:
                overall_pct = 95
            job.update(status="converting", progress=overall_pct,
                       track_index=track_state["index"], track_total=track_state["total"])
            _push(job_id, {
                "type": "progress", "progress": overall_pct, "status": "converting",
                "speed": "", "eta": "",
                "track_index": track_state["index"],
                "track_total": track_state["total"],
                "track_title": track_state["track_title"],
            })

    os.makedirs(output_folder, exist_ok=True)

    # Snapshot existing MP3s so we can detect newly created ones
    existing_mp3s = set(
        f for f in os.listdir(output_folder) if f.lower().endswith(".mp3")
    ) if os.path.exists(output_folder) else set()

    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            },
            {
                "key": "FFmpegThumbnailsConvertor",
                "format": "jpg",
                "when": "before_dl",
            },
            {
                "key": "EmbedThumbnail",
            },
            {
                "key": "FFmpegMetadata",
                "add_metadata": True,
            },
        ],
        "outtmpl": os.path.join(output_folder, "%(title)s.%(ext)s"),
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
        "writethumbnail": True,
        "noplaylist": False,
        "ignoreerrors": True,
    }
    if FFMPEG_LOCATION:
        ydl_opts["ffmpeg_location"] = FFMPEG_LOCATION

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info first (no download) to get title + count
            info = ydl.extract_info(url, download=False)
            is_playlist = info.get("_type") == "playlist"

            if is_playlist:
                title   = info.get("title", "Playlist")
                entries = [e for e in (info.get("entries") or []) if e]
                count   = len(entries)
                track_state["total"] = count
            else:
                title   = info.get("title", "Unknown")
                count   = 1

            job.update(title=title, track_total=count)
            _push(job_id, {"type": "title", "title": title, "count": count})

            # Download + convert everything
            ydl.download([url])

        # Detect newly created MP3s
        new_mp3s = sorted(
            f for f in os.listdir(output_folder)
            if f.lower().endswith(".mp3") and f not in existing_mp3s
        )

        # Re-save ID3 tags as v2.3 so Windows Explorer shows album art
        for fname in new_mp3s:
            try:
                fpath = os.path.join(output_folder, fname)
                tags = mutagen.id3.ID3(fpath)
                tags.save(fpath, v2_version=3)
            except Exception:
                pass

        first = new_mp3s[0] if new_mp3s else None

        job.update(status="complete", progress=100, filename=first, filenames=new_mp3s)
        _push(job_id, {
            "type": "complete",
            "title": title,
            "filename": first,
            "filenames": new_mp3s,
            "count": len(new_mp3s),
        })

    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        if "ffmpeg" in msg.lower() or "ffprobe" in msg.lower():
            msg = "ffmpeg not found. Please run setup.bat to install it."
        job.update(status="error", error=msg)
        _push(job_id, {"type": "error", "error": msg})
    except Exception as e:
        job.update(status="error", error=str(e))
        _push(job_id, {"type": "error", "error": str(e)})
    finally:
        _push(job_id, None)  # sentinel: close SSE stream


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    config = load_config()
    return render_template("index.html", config=config)


@app.route("/convert", methods=["POST"])
def convert():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    config = load_config()
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "url": url,
        "status": "queued",
        "progress": 0,
        "filename": None,
        "filenames": [],
        "title": None,
        "error": None,
        "speed": "",
        "eta": "",
    }

    threading.Thread(
        target=_convert_worker,
        args=(job_id, url, config["output_folder"]),
        daemon=True,
    ).start()

    return jsonify({"job_id": job_id})


@app.route("/stream/<job_id>")
def stream(job_id: str):
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404

    job = jobs[job_id]

    # If already complete/error, send final state immediately without blocking
    if job["status"] in ("complete", "error"):
        def _done():
            if job["status"] == "complete":
                payload = {"type": "complete", "title": job["title"], "filename": job["filename"], "filenames": job.get("filenames", [])}
            else:
                payload = {"type": "error", "error": job["error"]}
            yield f"data: {json.dumps(payload)}\n\n"
        return Response(_done(), content_type="text/event-stream",
                        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    q = _get_queue(job_id)

    def generate():
        while True:
            try:
                event = q.get(timeout=30)
                if event is None:
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    break
                yield f"data: {json.dumps(event)}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return Response(
        generate(),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/status/<job_id>")
def status(job_id: str):
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(jobs[job_id])


@app.route("/jobs")
def list_jobs():
    return jsonify(list(reversed(list(jobs.values()))))


@app.route("/files")
def list_files():
    config = load_config()
    folder = config["output_folder"]
    if not os.path.exists(folder):
        return jsonify([])
    files = []
    for name in os.listdir(folder):
        if name.lower().endswith(".mp3"):
            path = os.path.join(folder, name)
            files.append({
                "name": name,
                "size": os.path.getsize(path),
                "modified": os.path.getmtime(path),
            })
    files.sort(key=lambda f: f["modified"], reverse=True)
    return jsonify(files)


@app.route("/download/<path:filename>")
def download(filename: str):
    config = load_config()
    output_folder = os.path.abspath(config["output_folder"])
    filepath = os.path.abspath(os.path.join(output_folder, filename))

    # Security: prevent path traversal
    if not filepath.startswith(output_folder + os.sep) and filepath != output_folder:
        return jsonify({"error": "Invalid path"}), 403
    if not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 404

    return send_file(filepath, as_attachment=True, mimetype="audio/mpeg")


@app.route("/config", methods=["GET"])
def get_config():
    return jsonify(load_config())


@app.route("/config", methods=["POST"])
def update_config():
    data = request.get_json(silent=True) or {}
    config = load_config()
    if "output_folder" in data:
        config["output_folder"] = data["output_folder"]
    if "port" in data:
        config["port"] = int(data["port"])
    save_config(config)
    return jsonify(config)


# ---------------------------------------------------------------------------
# Server info (used by mobile app for discovery)
# ---------------------------------------------------------------------------

@app.route("/info")
def info():
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "127.0.0.1"
    config = load_config()
    return jsonify({
        "name": hostname,
        "ip": local_ip,
        "port": config.get("port", 5000),
        "output_folder": config["output_folder"],
        "version": "1.0.0",
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    config = load_config()
    port = config.get("port", 5000)
    output_folder = config["output_folder"]

    ffmpeg_ok = FFMPEG_LOCATION is not None or _find_ffmpeg() is None

    print("=" * 55)
    print("  YouTube -> MP3 Converter")
    print("=" * 55)
    print(f"  URL:    http://localhost:{port}")
    print(f"  Output: {output_folder}")
    if not ffmpeg_ok:
        print()
        print("  WARNING: ffmpeg not found!")
        print("  Run setup.bat to install it, then restart.")
    print("=" * 55)
    print()

    os.makedirs(output_folder, exist_ok=True)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
