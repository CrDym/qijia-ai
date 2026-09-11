"use client";
import { useConfirmation } from "./confirmation-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  documentSchema,
  type DocumentInput,
  type FamilyDocument,
  type Organization,
} from "@/schemas/document";
import { Icon } from "./icon";
import { apiRequest } from "@/lib/client";
import { CATEGORY_META } from "./categories";
import { FileImport } from "./file-import";
import {
  formatFileSize,
  isImageFile,
  type FileImportResult,
} from "@/schemas/attachment";
import { emptyHealthRecord, type HealthOrganization } from "@/schemas/health";
import {
  HealthRecordFields,
  HealthRecordBasics,
  HealthRecordDetails,
  HEALTH_TEXT_FIELDS,
} from "./health-record-fields";
import { ImageAnalysisPanel, ImagePreview } from "./image-analysis";

type Props = (
  | {
      mode: "create";
      initial?: Partial<DocumentInput>;
      initialFile?: File | null;
    }
  | { mode: "view"; document: FamilyDocument }
) & {
  aiConfigured: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
};

function initialDraft(props: Props): DocumentInput {
  if (props.mode === "view") {
    const { title, content, summary, category, tags, source, health } =
      props.document;
    return { title, content, summary, category, tags, source, health };
  }
  return {
    title: "",
    content: "",
    summary: "",
    category: "实用知识",
    tags: [],
    source: "",
    health: props.initial?.category === "健康档案" ? emptyHealthRecord() : null,
    ...props.initial,
  };
}

function fullDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function DocumentDialog(props: Props) {
  const [baseline] = useState(() => initialDraft(props));
  const [draft, setDraft] = useState<DocumentInput>(baseline);
  const isHealthRecord = Boolean(draft.health);
  const recordLabel = isHealthRecord ? "健康记录" : "资料";
  const [tagsText, setTagsText] = useState(baseline.tags.join("，"));
  const [editing, setEditing] = useState(props.mode === "create");
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(
    props.mode === "create" ? (props.initialFile ?? null) : null,
  );
  const [attachmentRemoved, setAttachmentRemoved] = useState(false);
  const existingAttachment =
    props.mode === "view" ? props.document.attachment : null;
  const currentAttachment = selectedFile
    ? {
        name: selectedFile.name,
        mimeType: selectedFile.type,
        size: selectedFile.size,
      }
    : attachmentRemoved
      ? null
      : existingAttachment;
  const [suggestion, setSuggestion] = useState<Organization | null>(null);
  const [healthSuggestion, setHealthSuggestion] =
    useState<HealthOrganization | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const confirm = useConfirmation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const dirty =
    editing &&
    ((props.mode === "create" &&
      Boolean(draft.content.trim() || draft.title.trim())) ||
      selectedFile !== null ||
      attachmentRemoved ||
      JSON.stringify(draft) !== JSON.stringify(baseline) ||
      tagsText !== baseline.tags.join("，"));
  const busy = saving || organizing || importing;
  const { onClose } = props;

  const requestClose = useCallback(async () => {
    if (busy) return;
    if (
      !dirty ||
      (await confirm("继续编辑可以保留这次输入，直接离开会放弃修改。"))
    )
      onClose();
  }, [busy, dirty, onClose, confirm]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!dirty && !saving) return;
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [dirty, saving]);

  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  function update<K extends keyof DocumentInput>(
    key: K,
    value: DocumentInput[K],
  ) {
    setDraft((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "category"
        ? {
            health:
              value === "健康档案"
                ? (previous.health ?? emptyHealthRecord())
                : null,
          }
        : {}),
    }));
    setNotice("");
    if (key === "content" || key === "category") {
      setSuggestion(null);
      setHealthSuggestion(null);
    }
  }

  async function organize() {
    setError("");
    setNotice("");
    setSuggestion(null);
    setHealthSuggestion(null);
    if (draft.content.trim().length < 10) {
      setError("至少填写 10 个字，AI 才能更好地整理。");
      contentRef.current?.focus();
      return;
    }
    setOrganizing(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await apiRequest<Organization | HealthOrganization>(
        draft.health ? "/api/health/organize" : "/api/organize",
        {
          method: "POST",
          body: JSON.stringify({ content: draft.content }),
          signal: controller.signal,
        },
      );
      if ("recordType" in result) setHealthSuggestion(result);
      else setSuggestion(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "AI 整理失败，请重试",
        );
    } finally {
      setOrganizing(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    setDraft((previous) => ({ ...previous, ...suggestion }));
    setTagsText(suggestion.tags.join("，"));
    setSuggestion(null);
    setNotice("已填入整理建议，原文保持不变。检查后点击保存即可。");
  }

  function onFileImported(file: File, result: FileImportResult) {
    setSelectedFile(file);
    setAttachmentRemoved(false);
    setSuggestion(null);
    setHealthSuggestion(null);
    setError("");
    setDraft((previous) => ({
      ...previous,
      title: previous.title.trim() ? previous.title : result.title,
      content: result.content || previous.content,
      source: previous.source.trim() ? previous.source : result.attachment.name,
    }));
    setNotice(
      result.content
        ? isHealthRecord
          ? "文件文字已填入病历原文，请核对所属成员、日期和内容后保存。原文件会一起保留。"
          : "文件文字已填入正文，请核对内容和分类后保存。原文件会一起保留。"
        : "已选择原文件，请填写或核对正文后保存。",
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const tags = tagsText
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const validation = documentSchema.safeParse({ ...draft, tags });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "请检查填写内容");
      return;
    }
    setSaving(true);
    try {
      let body: string | FormData = JSON.stringify(validation.data);
      if (selectedFile || attachmentRemoved) {
        body = new FormData();
        body.set("document", JSON.stringify(validation.data));
        if (selectedFile) body.set("file", selectedFile);
        else body.set("removeAttachment", "true");
      }
      await apiRequest(
        props.mode === "view"
          ? `/api/documents/${props.document.id}`
          : "/api/documents",
        {
          method: props.mode === "view" ? "PUT" : "POST",
          body,
        },
      );
      props.onChanged(
        props.mode === "view"
          ? `${recordLabel}已更新`
          : isHealthRecord
            ? "健康记录已保存"
            : "资料已收藏，下次需要时一搜就有。",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (props.mode !== "view" || busy) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/documents/${props.document.id}`, {
        method: "DELETE",
      });
      props.onChanged(`${recordLabel}已删除`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const meta = CATEGORY_META[draft.category];

  return (
    <dialog
      ref={dialogRef}
      className={`document-dialog${isHealthRecord ? " health-document-dialog" : ""}`}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          const rect = dialogRef.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            requestClose();
        }
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="dialog-eyebrow">
            {isHealthRecord ? "YOUR FAMILY HEALTH" : "YOUR FAMILY LIBRARY"}
          </span>
          <h2 id="dialog-title">
            {editing
              ? props.mode === "create"
                ? isHealthRecord
                  ? "新增健康记录"
                  : "收藏一条新资料"
                : `编辑${recordLabel}`
              : `${recordLabel}详情`}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={`关闭${recordLabel}面板`}
          onClick={requestClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </div>

      {editing ? (
        <form onSubmit={save} className="document-form">
          <div className="dialog-body">
            <p className="form-intro">
              {isHealthRecord
                ? "先确认所属家人和记录信息，再上传病历、检查报告或处方，也可以手动录入原文。"
                : "上传一份文件，或直接留下文字。每一条小记录，都可能帮上未来的你。"}
            </p>
            {draft.health && (
              <HealthRecordBasics
                value={draft.health}
                onChange={(value) => update("health", value)}
                disabled={busy}
              />
            )}
            <FileImport
              purpose={isHealthRecord ? "health" : "document"}
              attachment={currentAttachment}
              disabled={busy}
              hasContent={Boolean(draft.content.trim())}
              onBusyChange={setImporting}
              onImported={onFileImported}
              onRemove={() => {
                setSelectedFile(null);
                setAttachmentRemoved(Boolean(existingAttachment));
                setNotice("附件已从表单移除，正文保留；保存后生效。");
              }}
            />
            {currentAttachment && isImageFile(currentAttachment.name) && (
              <ImageAnalysisPanel
                key={
                  selectedFile
                    ? `${selectedFile.name}-${selectedFile.lastModified}-${selectedFile.size}`
                    : "saved-image"
                }
                file={selectedFile}
                documentId={
                  props.mode === "view" && !attachmentRemoved
                    ? props.document.id
                    : undefined
                }
                aiConfigured={props.aiConfigured}
                disabled={busy}
                hasContent={Boolean(draft.content.trim())}
                onBusyChange={setImporting}
                onApply={(result) => {
                  setDraft((previous) => ({
                    ...previous,
                    content: result.content,
                    title: previous.title.trim()
                      ? previous.title
                      : result.title,
                  }));
                  setSuggestion(null);
                  setHealthSuggestion(null);
                  setNotice("识别文字已填入正文，请对照原图核对后保存。");
                }}
              />
            )}
            <fieldset disabled={busy}>
              <div className="field-label">
                <label htmlFor="doc-content">
                  {isHealthRecord ? "病历 / 报告原文" : "正文"} <span>*</span>
                </label>
                <span>{draft.content.length.toLocaleString()} / 20,000</span>
              </div>
              <textarea
                ref={contentRef}
                id="doc-content"
                required
                maxLength={20000}
                className="content-input"
                rows={7}
                placeholder={
                  isHealthRecord
                    ? "粘贴病历、检查报告或处方原文，也可上传文件提取或用 AI 识别图片。请保留原始数值、单位与用药说明。"
                    : "粘贴聊天里的一段信息，或写下今天值得记住的经验…"
                }
                value={draft.content}
                onChange={(event) => update("content", event.target.value)}
              />
            </fieldset>
            <div
              className={`ai-strip ${!props.aiConfigured ? "unconfigured" : ""}`}
            >
              <div>
                <Icon name="sparkle" size={19} />
                <span>
                  {props.aiConfigured
                    ? draft.health
                      ? "提取病历要点与原文医嘱"
                      : "提炼标题、摘要、分类和标签"
                    : "AI 整理待配置，仍可手动保存"}
                </span>
              </div>
              <button
                className="button ai-button"
                type="button"
                disabled={busy || !props.aiConfigured}
                onClick={organize}
              >
                {organizing ? (
                  <>
                    <span className="spinner" />
                    正在整理…
                  </>
                ) : (
                  <>
                    <Icon name="sparkle" size={15} />
                    {draft.health ? "AI 整理健康记录" : "AI 整理"}
                  </>
                )}
              </button>
            </div>
            {props.aiConfigured && (
              <p className="ai-disclosure">
                点击整理时，正文将发送给 AI
                设置中配置的服务。建议由你确认，原文会保留。
              </p>
            )}
            {suggestion && (
              <section className="ai-suggestion" aria-label="AI 整理建议">
                <div className="suggestion-heading">
                  <Icon name="sparkle" size={17} />
                  <h3>整理建议</h3>
                  <span>尚未采用</span>
                </div>
                <h4>{suggestion.title}</h4>
                <p>{suggestion.summary}</p>
                <div className="suggestion-tags">
                  <span>{suggestion.category}</span>
                  {suggestion.tags.map((tag, index) => (
                    <span key={`${tag}-${index}`}>#{tag}</span>
                  ))}
                </div>
                <div className="suggestion-actions">
                  <button
                    className="button secondary small"
                    type="button"
                    onClick={() => setSuggestion(null)}
                  >
                    暂不采用
                  </button>
                  <button
                    className="button primary small"
                    type="button"
                    onClick={applySuggestion}
                  >
                    <Icon name="check" size={14} />
                    采用建议
                  </button>
                </div>
              </section>
            )}
            {healthSuggestion && (
              <section className="ai-suggestion" aria-label="健康整理建议">
                <div className="suggestion-heading">
                  <Icon name="sparkle" size={17} />
                  <h3>健康整理建议</h3>
                  <span>尚未采用</span>
                </div>
                <h4>{healthSuggestion.title}</h4>
                <p>{healthSuggestion.summary}</p>
                <p>
                  {healthSuggestion.recordType} ·{" "}
                  {healthSuggestion.occurredOn || "日期未提供"}
                </p>
                <dl className="health-suggestion-details">
                  {HEALTH_TEXT_FIELDS.map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{healthSuggestion[key] || "原文未明确提供"}</dd>
                    </div>
                  ))}
                </dl>
                {healthSuggestion.uncertainties.length > 0 && (
                  <div className="file-warning">
                    <strong>需要核对</strong>
                    <ul>
                      {healthSuggestion.uncertainties.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="file-import-hint">
                  采用后会替换标题、摘要、标签和健康记录字段，正文与所属成员保留。AI
                  仅整理原文，不能替代医生诊断。
                </p>
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => setHealthSuggestion(null)}
                  >
                    暂不采用
                  </button>
                  <button
                    type="button"
                    className="button primary small"
                    disabled={busy}
                    onClick={() => {
                      const {
                        title,
                        summary,
                        tags,
                        recordType,
                        occurredOn,
                        hospital,
                        diagnosis,
                        medications,
                        followUp,
                      } = healthSuggestion;
                      setDraft((previous) => ({
                        ...previous,
                        title,
                        summary,
                        tags,
                        health: {
                          ...previous.health!,
                          recordType,
                          occurredOn,
                          hospital,
                          diagnosis,
                          medications,
                          followUp,
                        },
                      }));
                      setTagsText(tags.join("，"));
                      setHealthSuggestion(null);
                      setNotice(
                        "健康整理建议已填入，请核对原件后保存。所属成员与正文保持不变。",
                      );
                    }}
                  >
                    采用健康建议
                  </button>
                </div>
              </section>
            )}
            {notice && (
              <p className="inline-notice" role="status">
                <Icon name="check" size={16} />
                {notice}
              </p>
            )}
            <fieldset disabled={busy} className="metadata-fields">
              <div className="field">
                <label htmlFor="doc-title">
                  {isHealthRecord ? "记录标题" : "标题"} <span>*</span>
                </label>
                <input
                  id="doc-title"
                  required
                  maxLength={100}
                  placeholder={
                    isHealthRecord
                      ? "例如：9 月门诊复查、年度体检报告"
                      : "取一个下次容易找到的标题"
                  }
                  value={draft.title}
                  onChange={(event) => update("title", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="doc-summary">
                  {isHealthRecord ? "记录摘要" : "摘要"}{" "}
                  <span className="optional">选填</span>
                </label>
                <textarea
                  id="doc-summary"
                  rows={3}
                  maxLength={500}
                  placeholder={
                    isHealthRecord
                      ? "简要记录本次就诊或检查的原文要点"
                      : "用几句话留下重点"
                  }
                  value={draft.summary}
                  onChange={(event) => update("summary", event.target.value)}
                />
              </div>
              <div className={isHealthRecord ? "health-tags-row" : "field-row"}>
                {!isHealthRecord && (
                  <div className="field">
                    <label htmlFor="doc-category">分类</label>
                    <select
                      id="doc-category"
                      value={draft.category}
                      onChange={(event) =>
                        update(
                          "category",
                          event.target.value as DocumentInput["category"],
                        )
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field tags-field">
                  <label htmlFor="doc-tags">
                    标签 <span className="optional">选填</span>
                  </label>
                  <input
                    id="doc-tags"
                    maxLength={180}
                    placeholder="用逗号分隔，最多 8 个"
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="doc-source">
                  {isHealthRecord ? "原件来源" : "来源"}{" "}
                  <span className="optional">选填</span>
                </label>
                <input
                  id="doc-source"
                  maxLength={500}
                  placeholder={
                    isHealthRecord
                      ? "例如：医院纸质病历、电子报告、处方照片"
                      : "例如：家人分享、说明书，或原文链接"
                  }
                  value={draft.source}
                  onChange={(event) => update("source", event.target.value)}
                />
              </div>
            </fieldset>
            {draft.health && (
              <HealthRecordFields
                value={draft.health}
                onChange={(value) => update("health", value)}
                disabled={busy}
              />
            )}
            {error && (
              <p ref={errorRef} className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <span>
              <Icon name="file" size={14} />
              {props.mode === "create"
                ? "保存后可随时编辑"
                : "原始创建时间将保留"}
            </span>
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={requestClose}
              >
                取消
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {saving ? (
                  <>
                    <span className="spinner" />
                    正在保存…
                  </>
                ) : (
                  <>
                    <Icon name="check" size={16} />
                    保存{recordLabel}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="dialog-body detail-body">
            <div className="detail-category">
              <span className={`category-icon ${meta.tone}`}>
                <Icon name={meta.icon} />
              </span>
              <span>{draft.category}</span>
            </div>
            <h3 className="detail-title">{draft.title}</h3>
            <p className="detail-date">
              {props.mode === "view" &&
                `更新于 ${fullDate(props.document.updatedAt)}`}
            </p>
            {draft.tags.length > 0 && (
              <div className="detail-tags">
                {draft.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            {draft.summary && (
              <section className="detail-summary">
                <h4>内容摘要</h4>
                <p>{draft.summary}</p>
              </section>
            )}
            {draft.health && <HealthRecordDetails value={draft.health} />}
            {props.mode === "view" &&
              props.document.attachment &&
              isImageFile(props.document.attachment.name) && (
                <ImagePreview documentId={props.document.id} />
              )}
            <section className="detail-content">
              <h4>原文</h4>
              <p>{draft.content}</p>
            </section>
            {props.mode === "view" && props.document.attachment && (
              <div className="attachment-row detail-attachment">
                <Icon name="paperclip" size={20} />
                <div>
                  <strong>{props.document.attachment.name}</strong>
                  <span>
                    {formatFileSize(props.document.attachment.size)} ·
                    已保存的原文件
                  </span>
                </div>
                <a
                  className="button secondary small"
                  href={`/api/documents/${props.document.id}/file`}
                  download
                >
                  <Icon name="download" size={15} />
                  下载原文件
                </a>
              </div>
            )}
            {draft.source && (
              <div className="detail-source">
                <Icon name="link" size={16} />
                <div>
                  <span>{isHealthRecord ? "原件来源" : "资料来源"}</span>
                  <p>{draft.source}</p>
                </div>
              </div>
            )}
            <p className="created-date">
              {props.mode === "view" &&
                `${isHealthRecord ? "记录创建于" : "收藏于"} ${fullDate(props.document.createdAt)}`}
            </p>
            {error && (
              <p ref={errorRef} className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button
              className="text-button delete-button"
              disabled={saving}
              onClick={async () => {
                if (
                  await confirm(
                    `「${draft.title}」及其原文件将被删除，无法在应用内恢复。`,
                    {
                      title: `删除这条${recordLabel}？`,
                      confirmLabel: `删除${recordLabel}`,
                      danger: true,
                    },
                  )
                )
                  await remove();
              }}
            >
              <Icon name="trash" size={16} />
              删除{recordLabel}
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={() => {
                setEditing(true);
                setError("");
              }}
            >
              <Icon name="edit" size={16} />
              编辑{recordLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
