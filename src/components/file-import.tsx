"use client";

import { useEffect, useRef, useState } from "react";
import {
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  fileExtension,
  isImageFile,
  formatFileSize,
  type AttachmentMeta,
  type FileImportResult,
} from "@/schemas/attachment";
import { apiRequest } from "@/lib/client";
import { Icon } from "./icon";

type Props = {
  purpose?: "document" | "health";
  attachment: AttachmentMeta | null;
  disabled: boolean;
  hasContent: boolean;
  onBusyChange: (busy: boolean) => void;
  onImported: (file: File, result: FileImportResult) => void;
  onRemove: () => void;
};

export function FileImport({
  purpose = "document",
  attachment,
  disabled,
  hasContent,
  onBusyChange,
  onImported,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, []);

  async function importFile(file: File) {
    if (disabled) return;
    setPending(null);
    setError("");
    setWarning(null);
    setImporting(true);
    onBusyChange(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await apiRequest<FileImportResult>("/api/files/extract", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (mounted.current) {
        onImported(file, result);
        setWarning(result.warning);
      }
    } catch (error) {
      if (mounted.current)
        setError(
          controller.signal.aborted
            ? "文件提取超时，请拆分或换一个文件后重试；当前内容已保留。"
            : error instanceof Error
              ? error.message
              : "文件导入失败，请重新选择",
        );
    } finally {
      window.clearTimeout(timer);
      if (mounted.current) {
        setImporting(false);
        onBusyChange(false);
      }
    }
  }

  function selectFiles(files: FileList | null) {
    if (disabled || !files?.length) return;
    setError("");
    setPending(null);
    if (files.length !== 1) {
      setError("请一次导入一个文件。");
      return;
    }
    const file = files[0];
    if (!fileExtension(file.name)) {
      setError("支持 JPG、PNG、WebP、PDF、Word（.docx）、TXT 和 Markdown。");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("单个文件不能超过 10 MB，请压缩或拆分后重试。");
      return;
    }
    if (!file.size) {
      setError("文件为空，请选择有内容的文件。");
      return;
    }
    if (hasContent && !isImageFile(file.name)) setPending(file);
    else void importFile(file);
  }

  return (
    <section className="file-import" aria-label="文件导入">
      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="选择资料文件"
        disabled={disabled}
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        className={`file-dropzone ${dragging ? "dragging" : ""} ${disabled ? "is-disabled" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            dragDepth.current++;
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (--dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          selectFiles(event.dataTransfer.files);
        }}
      >
        <span className="file-upload-icon">
          {importing ? (
            <span className="spinner" />
          ) : (
            <Icon name="upload" size={22} />
          )}
        </span>
        <div>
          <h3>
            {importing
              ? "正在读取文件…"
              : attachment
                ? "可以替换文件，也可以继续编辑正文"
                : purpose === "health"
                  ? "上传病历、检查报告或处方原件"
                  : "把文件拖到这里，轻松收进资料库"}
          </h3>
          <p>JPG / PNG / WebP、PDF、Word、TXT、Markdown · 单个不超过 10 MB</p>
        </div>
        <button
          className="button secondary small"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {attachment ? "重新选择" : "选择文件"}
        </button>
      </div>
      {pending && (
        <div className="file-replace-confirm" role="alert">
          <p>
            当前已有正文。导入「{pending.name}
            」会用提取文字替换正文，已填写的标题、摘要、标签和来源会保留，请一并核对。
          </p>
          <div>
            <button
              className="button secondary small"
              type="button"
              disabled={disabled}
              onClick={() => setPending(null)}
            >
              保留当前内容
            </button>
            <button
              className="button primary small"
              type="button"
              disabled={disabled}
              onClick={() => void importFile(pending)}
            >
              导入并替换正文
            </button>
          </div>
        </div>
      )}
      {attachment && (
        <div className="attachment-row">
          <Icon name="paperclip" size={18} />
          <div>
            <strong>{attachment.name}</strong>
            <span>
              {formatFileSize(attachment.size)} · 原文件随资料一起保存
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="移除附件"
            disabled={disabled}
            onClick={() => {
              setWarning(null);
              setPending(null);
              onRemove();
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {warning && (
        <p className="file-warning" role="status">
          {warning}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="file-import-hint">
        导入文件不会自动发送给 AI。检查正文后保存，也可以再用 AI 帮你整理。
      </p>
    </section>
  );
}
