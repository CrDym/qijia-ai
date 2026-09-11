"use client";
import { useConfirmation } from "./confirmation-provider";

import Link from "next/link";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { apiRequest } from "@/lib/client";
import {
  CATEGORIES,
  documentSchema,
  type DocumentInput,
} from "@/schemas/document";
import { captureDraft, captureResultSchema } from "@/schemas/capture";
import {
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  fileExtension,
  formatFileSize,
  isImageFile,
  type FileImportResult,
} from "@/schemas/attachment";
import { emptyHealthRecord } from "@/schemas/health";
import { DocumentDialog } from "./document-dialog";
import {
  HealthRecordBasics,
  HealthRecordFields,
  HEALTH_TEXT_FIELDS,
} from "./health-record-fields";
import { ImagePreview } from "./image-analysis";
import { Icon } from "./icon";

type Props = {
  initial?: Partial<DocumentInput>;
  aiConfigured: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
};
type ManualInput = { initial: Partial<DocumentInput>; file: File | null };

export function CaptureDialog(props: Props) {
  const [manual, setManual] = useState<ManualInput | null>(null);
  return manual ? (
    <DocumentDialog
      mode="create"
      aiConfigured={props.aiConfigured}
      initial={manual.initial}
      initialFile={manual.file}
      onClose={props.onClose}
      onChanged={props.onChanged}
    />
  ) : (
    <AutomaticCapture {...props} onManual={setManual} />
  );
}

function AutomaticCapture({
  initial,
  aiConfigured,
  onClose,
  onChanged,
  onManual,
}: Props & { onManual: (input: ManualInput) => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<DocumentInput | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualPreparing, setManualPreparing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const busy = processing || saving || manualPreparing;
  const hasInput = Boolean(file || text.trim());

  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      mounted.current = false;
      dialog?.close();
      document.body.style.overflow = overflow;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasInput) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [hasInput]);

  useEffect(() => {
    if (
      !aiConfigured ||
      manualPreparing ||
      composing ||
      (!file && !text.trim())
    )
      return;
    const controller = new AbortController();
    requestRef.current = controller;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const timer = window.setTimeout(
      async () => {
        setProcessing(true);
        setError("");
        setDraft(null);
        setAdjusting(false);
        deadline = setTimeout(() => controller.abort(), 65000);
        try {
          let body: string | FormData = JSON.stringify({ content: text });
          if (file) {
            body = new FormData();
            body.set("file", file);
          }
          const result = captureResultSchema.parse(
            await apiRequest("/api/documents/prepare", {
              method: "POST",
              body,
              signal: controller.signal,
            }),
          );
          if (disposed || controller.signal.aborted) return;
          setDraft(captureDraft(result));
          setTagsText(result.tags.join("，"));
          setUncertainties(result.uncertainties);
          requestAnimationFrame(() =>
            resultRef.current?.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            }),
          );
        } catch (cause) {
          if (!disposed)
            setError(
              controller.signal.aborted
                ? "整理超时，输入仍然保留。请稍后重试或改为手动填写。"
                : cause instanceof Error
                  ? cause.message
                  : "整理失败，请重试",
            );
        } finally {
          clearTimeout(deadline);
          if (!disposed) setProcessing(false);
        }
      },
      file ? 200 : 1200,
    );
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [text, file, attempt, composing, aiConfigured, manualPreparing]);

  function clearResult() {
    setDraft(null);
    setUncertainties([]);
    setError("");
    setAdjusting(false);
  }

  function selectFiles(files: FileList | File[]) {
    if (busy || !files.length) return;
    if (files.length !== 1) {
      setError("请一次提供一个文件，每个文件生成一条记录。");
      return;
    }
    const next = files[0];
    if (!fileExtension(next.name) || !next.size || next.size > MAX_FILE_BYTES) {
      setError(
        "请选择一个有效的 JPG、PNG、WebP、PDF、Word、TXT 或 Markdown 文件，最大 10 MB。",
      );
      return;
    }
    clearResult();
    setText("");
    setFile(next);
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length) {
      event.preventDefault();
      selectFiles(event.clipboardData.files);
      return;
    }
    const incoming = event.clipboardData.getData("text/plain");
    const target = event.currentTarget;
    if (
      text.length -
        (target.selectionEnd - target.selectionStart) +
        incoming.length >
      20000
    ) {
      event.preventDefault();
      setError("原文超过 20,000 字，请拆分后粘贴，当前输入未被替换。");
    }
  }

  const confirm = useConfirmation();
  async function close() {
    if (saving || manualPreparing) return;
    if (hasInput && !(await confirm("这条资料尚未保存，确定放弃并关闭吗？")))
      return;
    onClose();
  }

  async function manual() {
    if (busy) return;
    setManualPreparing(true);
    try {
      let next: Partial<DocumentInput> = draft
        ? {
            ...draft,
            tags: tagsText
              .split(/[,，\n]/)
              .map((tag) => tag.trim())
              .filter(Boolean),
          }
        : { ...initial, content: text };
      if (file && !draft) {
        const form = new FormData();
        form.set("file", file);
        const result = await apiRequest<FileImportResult>(
          "/api/files/extract",
          { method: "POST", body: form },
        ).catch(() => null);
        next = {
          ...next,
          title: result?.title || file.name.slice(0, 100),
          content: result?.content || text,
          source: file.name.slice(0, 500),
        };
      }
      if (mounted.current) onManual({ initial: next, file });
    } finally {
      if (mounted.current) setManualPreparing(false);
    }
  }

  async function save() {
    if (!draft || busy || saveLock.current) return;
    const validation = documentSchema.safeParse({
      ...draft,
      tags: tagsText
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "请检查整理结果");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      let body: string | FormData = JSON.stringify(validation.data);
      if (file) {
        body = new FormData();
        body.set("document", JSON.stringify(validation.data));
        body.set("file", file);
      }
      await apiRequest("/api/documents", { method: "POST", body });
      if (mounted.current)
        onChanged(`已保存到${validation.data.category}，下次需要时一搜就有。`);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "保存失败，草稿仍然保留，请重试",
        );
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="document-dialog capture-dialog"
      aria-labelledby="capture-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="dialog-eyebrow">JUST DROP IT HERE</span>
          <h2 id="capture-title">交给 AI，轻松收藏</h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭新增资料"
          disabled={saving || manualPreparing}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="document-form">
        <div className="dialog-body">
          <p className="form-intro">
            粘贴一段原文，或放入一份文件。标题、分类和标签，AI 会帮你整理好。
          </p>
          {!aiConfigured && (
            <p className="file-warning">
              AI 尚未配置。可以先
              <Link href="/settings" target="_blank" rel="noopener noreferrer">
                前往 AI 设置
              </Link>
              ，配置后重新打开此入口；也可直接手动填写。
            </p>
          )}
          <p className="capture-disclosure">
            {aiConfigured
              ? "粘贴或上传后会自动发送至已配置的 AI 服务，产生 API 用量。结果仅作为草稿，确认后才入库。"
              : "当前不会发送内容给 AI。"}
          </p>
          <div
            className={`capture-input ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectFiles(event.dataTransfer.files);
            }}
          >
            {!file ? (
              <>
                <label className="sr-only" htmlFor="capture-text">
                  需要收藏的原文
                </label>
                <textarea
                  id="capture-text"
                  autoFocus
                  rows={6}
                  value={text}
                  maxLength={20000}
                  disabled={busy}
                  placeholder="粘贴聊天里的信息、维修经验、出行安排……也可以直接粘贴截图。"
                  onPaste={paste}
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={() => setComposing(false)}
                  onChange={(event) => {
                    clearResult();
                    setText(event.target.value);
                  }}
                />
              </>
            ) : (
              <div className="capture-file">
                <Icon name="paperclip" size={23} />
                <div>
                  <strong>{file.name}</strong>
                  <p>{formatFileSize(file.size)} · 原文件会随记录保留</p>
                </div>
                <button
                  className="icon-button"
                  aria-label="移除文件"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    clearResult();
                  }}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
            )}
            <input
              ref={uploadRef}
              type="file"
              className="sr-only"
              aria-label="选择资料文件"
              accept={FILE_ACCEPT}
              disabled={busy}
              onChange={(event) => {
                if (event.target.files) selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="capture-input-footer">
              <button
                className="button secondary small"
                type="button"
                disabled={busy}
                onClick={() => uploadRef.current?.click()}
              >
                <Icon name="upload" size={16} />
                {file ? "更换文件" : "上传文件或图片"}
              </button>
              <span>
                {file
                  ? "一次一份文件"
                  : `${text.length.toLocaleString()} / 20,000`}
              </span>
            </div>
          </div>
          <p className="file-import-hint">
            可拖拽文件到上方区域 · JPG / PNG / WebP / PDF / Word / TXT /
            Markdown · 最大 10 MB
          </p>
          {processing && (
            <div className="capture-progress" role="status">
              <span className="spinner" />
              <div>
                <strong>
                  {file && isImageFile(file.name)
                    ? "正在识别图片并整理…"
                    : "正在理解内容并自动分类…"}
                </strong>
                <p>稍等片刻，整理好后只需确认保存。</p>
              </div>
            </div>
          )}
          {hasInput && aiConfigured && !processing && !draft && !error && (
            <p className="settings-help" role="status">
              {composing ? "输入完成后自动整理" : "即将自动整理…"}
            </p>
          )}
          {error && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
              {!draft && aiConfigured && hasInput && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => {
                    clearResult();
                    setAttempt((value) => value + 1);
                  }}
                >
                  重新整理
                </button>
              )}
            </div>
          )}
          {draft && (
            <section
              ref={resultRef}
              className="capture-result"
              aria-label="AI 整理结果"
            >
              <div className="capture-result-heading">
                <span>
                  <Icon name="check" size={16} />
                  已整理 · 尚未保存
                </span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setAdjusting((value) => !value)}
                >
                  {adjusting ? "收起编辑" : "调整结果（可选）"}
                </button>
              </div>
              <span className="capture-category">
                {draft.category} · 自动分类
              </span>
              <h3>{draft.title}</h3>
              <p className="capture-summary">{draft.summary}</p>
              <div className="detail-tags">
                {draft.tags.map((tag, i) => (
                  <span key={`${tag}-${i}`}>#{tag}</span>
                ))}
              </div>
              {uncertainties.length > 0 && (
                <div className="file-warning">
                  <strong>需要核对</strong>
                  <ul>
                    {uncertainties.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.health && (
                <>
                  <p className="settings-help">
                    识别为健康资料，请确认属于哪位家人。AI
                    不会推断成员身份，也不提供诊疗建议。
                  </p>
                  <HealthRecordBasics
                    value={draft.health}
                    memberOnly={!adjusting}
                    disabled={busy}
                    onChange={(health) => setDraft({ ...draft, health })}
                  />
                  {!adjusting && (
                    <div className="capture-health">
                      <p>
                        {draft.health.recordType} ·{" "}
                        {draft.health.occurredOn || "原文未提供完整日期"}
                      </p>
                      {HEALTH_TEXT_FIELDS.filter(
                        ([key]) => draft.health?.[key],
                      ).map(([key, label]) => (
                        <p key={key}>
                          <strong>{label}：</strong>
                          {draft.health?.[key]}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
              {adjusting && (
                <fieldset disabled={busy} className="capture-edit">
                  <div className="field">
                    <label htmlFor="capture-title-edit">标题</label>
                    <input
                      id="capture-title-edit"
                      maxLength={100}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="capture-summary">摘要</label>
                    <textarea
                      id="capture-summary"
                      maxLength={500}
                      rows={3}
                      value={draft.summary}
                      onChange={(event) =>
                        setDraft({ ...draft, summary: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="capture-category">分类</label>
                    <select
                      id="capture-category"
                      value={draft.category}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          category: event.target
                            .value as DocumentInput["category"],
                          health:
                            event.target.value === "健康档案"
                              ? (draft.health ?? emptyHealthRecord())
                              : null,
                        })
                      }
                    >
                      {CATEGORIES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="capture-tags">标签</label>
                    <input
                      id="capture-tags"
                      value={tagsText}
                      onChange={(event) => {
                        setTagsText(event.target.value);
                        setDraft({
                          ...draft,
                          tags: event.target.value
                            .split(/[,，\n]/)
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="capture-source">来源</label>
                    <input
                      id="capture-source"
                      maxLength={500}
                      value={draft.source}
                      onChange={(event) =>
                        setDraft({ ...draft, source: event.target.value })
                      }
                    />
                  </div>
                  {draft.health && (
                    <HealthRecordFields
                      value={draft.health}
                      disabled={busy}
                      onChange={(health) => setDraft({ ...draft, health })}
                    />
                  )}
                </fieldset>
              )}
              <details
                className="capture-original"
                open={Boolean(file && isImageFile(file.name))}
              >
                <summary>
                  {file && isImageFile(file.name)
                    ? "原图与识别正文（请核对）"
                    : "查看原文"}
                </summary>
                {file && isImageFile(file.name) && <ImagePreview file={file} />}
                {adjusting ? (
                  <>
                    <label className="sr-only" htmlFor="capture-content-edit">
                      核对正文
                    </label>
                    <textarea
                      id="capture-content-edit"
                      disabled={busy}
                      value={draft.content}
                      rows={7}
                      maxLength={20000}
                      onChange={(event) =>
                        setDraft({ ...draft, content: event.target.value })
                      }
                    />
                  </>
                ) : (
                  <p className="extracted-text">{draft.content}</p>
                )}
              </details>
            </section>
          )}
        </div>
        <div className="dialog-footer capture-footer">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void manual()}
          >
            {manualPreparing ? "准备中…" : "手动填写"}
          </button>
          <div>
            <button
              className="button secondary"
              disabled={saving || manualPreparing}
              onClick={close}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={
                !draft ||
                busy ||
                Boolean(draft.health && !draft.health.memberId)
              }
              onClick={() => void save()}
            >
              <Icon name="check" size={16} />
              {saving ? "保存中…" : "确认保存"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
