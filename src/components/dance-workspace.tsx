"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { homeToday } from "../lib/dates";
import { formatBytes } from "../lib/format-bytes";
import {
  danceLabels,
  MAX_VIDEO_SIZE,
  type DanceInput,
  type DanceVideo,
} from "../schemas/dance";
const links = [
  { href: "/", label: "今日生活", icon: "home" },
  { href: "/library", label: "家庭资料库", icon: "library" },
  { href: "/health", label: "家庭健康", icon: "heart" },
  { href: "/dance", label: "街舞成长册", icon: "video" },
  { href: "/settings", label: "AI 设置", icon: "settings" },
] as const;
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || "操作失败，请稍后重试");
  }
  return response;
}
// 本地解码并截取一帧，不上传给第三方，也不需要安装视频转码工具。
function createPoster(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const fail = () => {
      cleanup();
      reject(
        new Error(`${file.name} 无法解码，请转换为 H.264 + AAC 的 MP4 后上传`),
      );
    };
    const timer = setTimeout(fail, 15000);
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration / 2);
    };
    video.onseeked = () => {
      if (!video.videoWidth || !video.videoHeight) {
        fail();
        return;
      }
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        640 / video.videoWidth,
        640 / video.videoHeight,
        1,
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas
        .getContext("2d")!
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (blob) resolve(blob);
          else reject(new Error("无法生成视频封面，请重新选择视频"));
        },
        "image/jpeg",
        0.75,
      );
    };
    video.onerror = fail;
    video.src = url;
  });
}
function upload(
  file: File,
  input: DanceInput,
  onProgress: (value: number) => void,
): Promise<DanceVideo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/dance?${new URLSearchParams({ ...input, name: file.name })}`,
    );
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error("连接中断，请刷新列表核对是否已保存，再决定是否重传"));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error?.message || "上传失败"));
      } catch {
        reject(new Error("无法确认上传结果，请刷新列表核对后再重传"));
      }
    };
    xhr.send(file);
  });
}
function VideoCard({
  video,
  onEdit,
  onDelete,
  disabled,
}: {
  video: DanceVideo;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  return (
    <article className="dance-card">
      <video
        ref={player}
        controls
        playsInline
        preload="none"
        poster={`/api/dance/${video.id}/poster`}
        src={`/api/dance/${video.id}/file`}
        aria-label={`${video.date} ${danceLabels[video.kind]} ${video.name}`}
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert" className="dance-error">
          无法播放，请检查文件是否存在或转换为 H.264 MP4 后重新上传。
        </p>
      )}
      <div className="dance-card-info">
        <span title={video.name}>{video.name}</span>
        <small>{formatBytes(video.size)}</small>
      </div>
      <div className="dance-card-actions">
        <label>
          倍速{" "}
          <select
            aria-label={`${video.name} 播放速度`}
            defaultValue="1"
            onChange={(e) => {
              if (player.current)
                player.current.playbackRate = Number(e.target.value);
            }}
          >
            <option value="0.5">0.5×</option>
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <button disabled={disabled} onClick={onEdit}>
          修改
        </button>
        <button disabled={disabled} onClick={onDelete}>
          删除
        </button>
      </div>
    </article>
  );
}
export function DanceWorkspace() {
  const [videos, setVideos] = useState<DanceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState("");
  const [form, setForm] = useState<DanceInput | null>(null);
  const [editing, setEditing] = useState<DanceVideo | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [formError, setFormError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setVideos(await (await checked(await fetch("/api/dance"))).json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/dance")
      .then(checked)
      .then((response) => response.json())
      .then((items) => {
        if (active) setVideos(items);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "读取失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (form) dialog.current?.showModal();
    else dialog.current?.close();
  }, [form]);
  useEffect(() => {
    if (!busy && !files.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, files.length]);
  function begin(input: DanceInput, video: DanceVideo | null = null) {
    setEditing(video);
    setFiles([]);
    setFormError("");
    setProgress(0);
    setForm(input);
  }
  function close() {
    if (busy) return;
    if (files.length && !window.confirm("视频尚未上传，确定关闭吗？")) return;
    setFiles([]);
    setForm(null);
  }
  function selectFiles(selected: File[]) {
    if (busy) return;
    if (
      selected.some(
        (file) =>
          !/\.mp4$/i.test(file.name) ||
          !file.size ||
          file.size > MAX_VIDEO_SIZE,
      )
    ) {
      setFormError(
        "请选择非空 MP4 视频，每段最大 1 GB。MOV / HEVC 请先转换为 H.264 MP4。",
      );
      return;
    }
    setFormError("");
    setFiles(selected);
  }
  async function save() {
    if (!form || busy) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    let saved = 0;
    let missingPoster = false;
    try {
      if (editing) {
        const updated = await (
          await checked(
            await fetch(`/api/dance/${editing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            }),
          )
        ).json();
        setVideos((current) =>
          current.map((video) => (video.id === updated.id ? updated : video)),
        );
      } else {
        for (const file of files) {
          setStage(`正在准备 ${saved + 1}/${files.length}：${file.name}`);
          setProgress(0);
          const poster = await createPoster(file);
          setStage(`正在上传 ${saved + 1}/${files.length}：${file.name}`);
          const video = await upload(file, form, setProgress);
          saved++;
          // 封面失败不会回滚已保存的视频，也不会让重试重复上传该视频。
          try {
            await checked(
              await fetch(`/api/dance/${video.id}/poster`, {
                method: "PUT",
                headers: { "Content-Type": "image/jpeg" },
                body: poster,
              }),
            );
          } catch {
            missingPoster = true;
          }
          setVideos((current) => [...current, video]);
        }
      }
      setFiles([]);
      setForm(null);
      setFilter("all");
      setMonth("");
      setNotice(
        editing
          ? "日期和类型已更新"
          : `已保存 ${saved} 段视频${missingPoster ? "，部分封面生成失败，视频仍可播放" : ""}`,
      );
    } catch (e) {
      setFiles((current) => current.slice(saved));
      setFormError(
        `${saved ? `已保存 ${saved} 段；` : ""}${e instanceof Error ? e.message : "保存失败"}`,
      );
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  async function remove(video: DanceVideo) {
    if (
      !window.confirm(
        `删除“${video.name}”？应用保存的视频副本将一并删除，无法撤销；导入前的原文件不受影响。`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await checked(
        await fetch(`/api/dance/${video.id}`, { method: "DELETE" }),
      );
      setVideos((current) => current.filter((item) => item.id !== video.id));
      setNotice("视频已删除");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }
  const groups = new Map<string, DanceVideo[]>();
  [...videos]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
    .filter(
      (video) =>
        (filter === "all" || video.kind === filter) &&
        (!month || video.date.startsWith(month)),
    )
    .forEach((video) => {
      const key = `${video.date}-${video.kind}`;
      groups.set(key, [...(groups.get(key) || []), video]);
    });
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-symbol">
            <Icon name="home" size={22} />
          </span>
          <span>
            栖家<span className="brand-en">A PLACE FOR HOME</span>
          </span>
        </Link>
        <div className="home-label">
          <span className="home-dot" />
          我的家庭
        </div>
        <nav aria-label="主导航">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-item ${link.href === "/dance" ? "active" : ""}`}
              aria-current={link.href === "/dance" ? "page" : undefined}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="video" />
            <p>每一次练习，都值得留下。</p>
            <span>视频只保存在这台电脑。</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="home" size={16} />
            <span>我的家庭</span>
            <Icon name="chevron" size={12} />
            <strong>街舞成长册</strong>
          </div>
        </header>
        <main className="main-content dance-content">
          <nav className="workspace-tabs" aria-label="工作台">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === "/dance" ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <section className="dance-heading">
            <div>
              <p className="dance-eyebrow">一点一滴，跳出自己的节奏</p>
              <h1>街舞成长册</h1>
              <p>留住课后的展示，也记下平日的练习。</p>
            </div>
            <div className="dance-upload-actions">
              <button
                className="dance-primary"
                disabled={busy}
                onClick={() => begin({ date: homeToday(), kind: "showcase" })}
              >
                <Icon name="plus" size={18} />
                上传课后展示
              </button>
              <button
                disabled={busy}
                onClick={() => begin({ date: homeToday(), kind: "practice" })}
              >
                <Icon name="plus" size={18} />
                上传练习打卡
              </button>
            </div>
          </section>
          <div className="dance-filters">
            <div role="group" aria-label="视频类型">
              {[
                ["all", "全部"],
                ["showcase", "课后展示"],
                ["practice", "练习打卡"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              月份{" "}
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            {month && <button onClick={() => setMonth("")}>清除月份</button>}
          </div>
          {notice && (
            <p role="status" className="dance-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="dance-error">
              {error} <button onClick={() => void refresh()}>刷新列表</button>
            </p>
          )}
          {loading ? (
            <p className="dance-empty">正在读取成长记录…</p>
          ) : !groups.size ? (
            <div className="dance-empty">
              <Icon name="video" size={38} />
              <h2>
                {videos.length ? "没有符合筛选的记录" : "从第一段视频开始"}
              </h2>
              <p>
                {videos.length
                  ? "试试其他类型或月份。"
                  : "上传一段课后展示或练习视频，留下今天的进步。"}
              </p>
            </div>
          ) : (
            [...groups].map(([key, group]) => (
              <section className="dance-group" key={key}>
                <header>
                  <h2>
                    <time dateTime={group[0].date}>
                      {group[0].date.replaceAll("-", ".")}
                    </time>
                  </h2>
                  <span className={`dance-badge ${group[0].kind}`}>
                    {danceLabels[group[0].kind]}
                  </span>
                  <small>{group.length} 段视频</small>
                  <button
                    disabled={busy}
                    onClick={() =>
                      begin({ date: group[0].date, kind: group[0].kind })
                    }
                  >
                    ＋ 补充视频
                  </button>
                </header>
                <div className="dance-grid">
                  {group.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      disabled={busy}
                      onEdit={() =>
                        begin({ date: video.date, kind: video.kind }, video)
                      }
                      onDelete={() => void remove(video)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
          <footer className="dance-footer">
            本地保存 · {videos.length} 段视频 · 共{" "}
            {formatBytes(videos.reduce((sum, video) => sum + video.size, 0))}
            <span>
              备份时先停止应用，再复制数据库所在目录（默认 data，含视频）。
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        className="dance-dialog"
        aria-labelledby="dance-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {form && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <header>
              <h2 id="dance-dialog-title">
                {editing ? "修改记录" : `上传${danceLabels[form.kind]}`}
              </h2>
              <button
                type="button"
                aria-label="关闭"
                disabled={busy}
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </header>
            <fieldset disabled={busy}>
              <div className="dance-fields">
                <label>
                  日期
                  <input
                    autoFocus
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>
                <label>
                  类型
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        kind: e.target.value as DanceInput["kind"],
                      })
                    }
                  >
                    <option value="showcase">课后展示</option>
                    <option value="practice">练习打卡</option>
                  </select>
                </label>
              </div>
              {!editing && (
                <>
                  <div
                    className="dance-drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      selectFiles(Array.from(e.dataTransfer.files));
                    }}
                  >
                    <Icon name="upload" size={30} />
                    <p>将视频拖到这里，或选择文件</p>
                    <input
                      aria-label="选择视频"
                      type="file"
                      accept=".mp4,video/mp4"
                      multiple
                      onChange={(e) => {
                        selectFiles(Array.from(e.target.files || []));
                        e.target.value = "";
                      }}
                    />
                    <small>
                      支持多选，每段最大 1 GB。推荐 H.264 + AAC 的 MP4。
                    </small>
                  </div>
                  {files.length > 0 && (
                    <ul className="dance-file-list">
                      {files.map((file, index) => (
                        <li key={`${file.name}-${index}`}>
                          <span>{file.name}</span>
                          <button
                            type="button"
                            aria-label={`移除 ${file.name}`}
                            onClick={() =>
                              setFiles((current) =>
                                current.filter((_, i) => i !== index),
                              )
                            }
                          >
                            移除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </fieldset>
            {busy && (
              <div role="status">
                <p>{stage || "正在保存…"}</p>
                {!editing && (
                  <progress value={progress} max={100} aria-label="上传进度" />
                )}
                <small>
                  {progress === 100
                    ? "正在完成保存，请勿关闭页面"
                    : "请保持页面打开"}
                </small>
              </div>
            )}
            {formError && (
              <p role="alert" className="dance-error">
                {formError}
              </p>
            )}
            <footer>
              <button type="button" disabled={busy} onClick={close}>
                取消
              </button>
              <button
                className="dance-primary"
                disabled={busy || (!editing && !files.length)}
                type="submit"
              >
                {busy
                  ? "正在保存…"
                  : editing
                    ? "保存修改"
                    : `保存${files.length ? ` ${files.length} 段视频` : ""}`}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </div>
  );
}
