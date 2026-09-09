"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/client";
import type { ImageAnalysis } from "@/schemas/image";
import { Icon } from "./icon";

export function ImagePreview({
  file,
  documentId,
}: {
  file?: File | null;
  documentId?: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const src =
    !file && documentId ? `/api/documents/${documentId}/file` : undefined;
  if (!file && !documentId) return null;
  // 本地原图/Blob 不经过 Next 图片优化服务，避免额外缓存健康图片。
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      className="image-preview"
      src={src}
      alt="上传的资料原图，请与识别文字核对"
    />
  );
}

export function ImageAnalysisPanel({
  file,
  documentId,
  aiConfigured,
  disabled,
  hasContent,
  onBusyChange,
  onApply,
}: {
  file: File | null;
  documentId?: string;
  aiConfigured: boolean;
  disabled: boolean;
  hasContent: boolean;
  onBusyChange: (busy: boolean) => void;
  onApply: (result: ImageAnalysis) => void;
}) {
  const [result, setResult] = useState<ImageAnalysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function analyze() {
    if (disabled) return;
    setError("");
    setResult(null);
    setBusy(true);
    onBusyChange(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      let body: string | FormData = JSON.stringify({ documentId });
      if (file) {
        body = new FormData();
        body.set("file", file);
      }
      setResult(
        await apiRequest<ImageAnalysis>("/api/files/analyze", {
          method: "POST",
          body,
          signal: controller.signal,
        }),
      );
    } catch (error) {
      setError(
        controller.signal.aborted
          ? "图片解析超时，原文件和已填写内容已保留，请重试。"
          : error instanceof Error
            ? error.message
            : "图片解析失败，请重试",
      );
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="image-analysis" aria-label="图片解析">
      <ImagePreview file={file} documentId={documentId} />
      <div className="ai-strip">
        <div>
          <Icon name="sparkle" size={18} />
          <span>
            {aiConfigured
              ? "识别图片文字，核对后填入正文"
              : "图片可直接保存，AI 解析待配置"}
          </span>
        </div>
        <button
          type="button"
          className="button ai-button"
          disabled={disabled || !aiConfigured}
          onClick={analyze}
        >
          {busy ? "正在解析…" : "AI 解析图片"}
        </button>
      </div>
      <p className="ai-disclosure">
        点击解析会将这张图片发送给 AI
        设置中配置的服务。健康图片仅识别记录内容，不能替代医生诊断，请核对药名、剂量和数值。
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="ai-suggestion" aria-label="图片识别草稿">
          <h3>图片识别草稿 · 尚未采用</h3>
          <h4>{result.title}</h4>
          <p className="extracted-text">
            {result.content || "没有可识别的正文，请手动填写。"}
          </p>
          {result.uncertainties.length > 0 && (
            <div className="file-warning">
              <strong>需要核对</strong>
              <ul>
                {result.uncertainties.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="file-import-hint">
            {hasContent
              ? "采用后会替换当前正文，标题仅在为空时填入。"
              : "采用后填入正文，检查后再保存资料。"}
          </p>
          <div className="suggestion-actions">
            <button
              type="button"
              className="button secondary small"
              disabled={disabled}
              onClick={() => setResult(null)}
            >
              暂不采用
            </button>
            <button
              type="button"
              className="button primary small"
              disabled={disabled || !result.content}
              onClick={() => {
                onApply(result);
                setResult(null);
              }}
            >
              {hasContent ? "采用并替换正文" : "采用识别文字"}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
