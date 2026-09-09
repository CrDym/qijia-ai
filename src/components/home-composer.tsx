"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client";
import {
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  fileExtension,
  formatFileSize,
  isImageFile,
} from "@/schemas/attachment";
import { homeResultSchema, type HomeResult } from "@/schemas/home";
import { captureDraft } from "@/schemas/capture";
import { HomeDraftCard, type HomeCard } from "./home-draft-card";
import { DocumentDialog } from "./document-dialog";
import { ImagePreview } from "./image-analysis";
import { Icon } from "./icon";

function resultCards(result: HomeResult): HomeCard[] {
  return [
    ...(result.document
      ? [
          {
            id: crypto.randomUUID(),
            kind: "document" as const,
            data: captureDraft({
              ...result.document,
              content: result.content,
              source: result.source,
            }),
            clarification: result.document.uncertainties.join("；"),
            status: "pending" as const,
          },
        ]
      : []),
    ...[
      ...result.todos.map((todo) => ({
        ...todo,
        kind: "todo" as const,
        items: [] as string[],
      })),
      ...result.checklists.map((list) => ({
        ...list,
        kind: "checklist" as const,
      })),
    ].map((action) => ({
      id: crypto.randomUUID(),
      kind: "activity" as const,
      data: {
        kind: action.kind,
        title: action.title,
        notes: action.notes,
        dueOn: action.dueOn,
        items: action.items.map((text) => ({
          id: crypto.randomUUID(),
          text,
          completed: false,
        })),
        source: result.source,
        sourceContent: result.content,
      },
      clarification: action.clarification,
      status: "pending" as const,
    })),
  ];
}

export function HomeComposer({
  aiConfigured,
  onSaved,
  onDirtyChange,
}: {
  aiConfigured: boolean;
  onSaved: () => void;
  onDirtyChange: (value: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<HomeResult | null>(null);
  const [cards, setCards] = useState<HomeCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [manualDocument, setManualDocument] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [retry, setRetry] = useState(0);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const settled =
    (Boolean(result) || manualMode) &&
    cards.every((card) => card.status !== "pending");
  const dirty =
    busy ||
    savingCount > 0 ||
    cards.some((card) => card.status === "pending") ||
    (!settled && Boolean(content.trim() || file));
  const locked = busy || Boolean(result) || manualMode || savingCount > 0;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (
      !aiConfigured ||
      composing ||
      result ||
      manualDocument ||
      manualMode ||
      (!content.trim() && !file)
    )
      return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(
      async () => {
        setBusy(true);
        setError("");
        const timeout = window.setTimeout(() => controller.abort(), 60000);
        try {
          let body: FormData | string = JSON.stringify({ content });
          if (file) {
            body = new FormData();
            body.set("file", file);
          }
          const data = homeResultSchema.parse(
            await apiRequest<HomeResult>("/api/home/prepare", {
              method: "POST",
              body,
              signal: controller.signal,
            }),
          );
          if (controller.signal.aborted) return;
          setResult(data);
          setCards(resultCards(data));
          window.setTimeout(() => resultRef.current?.focus(), 0);
        } catch (error) {
          setError(
            controller.signal.aborted
              ? "整理超时，输入已保留，请重试。"
              : error instanceof Error
                ? error.message
                : "整理失败，请重试",
          );
        } finally {
          window.clearTimeout(timeout);
          setBusy(false);
        }
      },
      file ? 200 : 1200,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    content,
    file,
    aiConfigured,
    composing,
    result,
    manualDocument,
    manualMode,
    retry,
  ]);

  function selectFile(files: File[]) {
    if (locked) return;
    if (files.length !== 1) {
      setError("请一次上传一个文件");
      return;
    }
    const selected = files[0];
    if (!fileExtension(selected.name)) {
      setError("支持 JPG、PNG、WebP、PDF、Word、TXT 和 Markdown");
      return;
    }
    if (!selected.size || selected.size > MAX_FILE_BYTES) {
      setError("文件不能为空，且不能超过 10 MB");
      return;
    }
    if (
      content.trim() &&
      !window.confirm("上传文件将替换当前输入的文字，继续吗？")
    )
      return;
    setContent("");
    setFile(selected);
    setError("");
  }
  function reset() {
    if (busy || savingCount) return;
    if (
      dirty &&
      !window.confirm(
        "还有未保存的输入或建议，清空并继续吗？已保存的记录不受影响。",
      )
    )
      return;
    setContent("");
    setFile(null);
    setResult(null);
    setCards([]);
    setError("");
    setManualMode(false);
    window.setTimeout(() => textRef.current?.focus(), 0);
  }
  function addManual(kind: "todo" | "checklist") {
    setManualMode(true);
    setError("");
    setCards((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: "activity",
        status: "pending",
        manual: true,
        clarification: "",
        data: {
          kind,
          title: "",
          notes: "",
          dueOn: "",
          items:
            kind === "checklist"
              ? [{ id: crypto.randomUUID(), text: "", completed: false }]
              : [],
          source: file?.name || "",
          sourceContent: result?.content || content,
        },
      },
    ]);
    window.setTimeout(() => resultRef.current?.focus(), 0);
  }
  const closeManual = useCallback(() => setManualDocument(false), []);
  return (
    <section className="home-capture" aria-label="统一输入">
      <div
        className={`home-composer ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFile(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="composer-label">
          <Icon name="sparkle" size={18} />
          <label htmlFor="home-input">有什么想交给栖家？</label>
          <span>文字 · 图片 · 文件</span>
        </div>
        <textarea
          ref={textRef}
          id="home-input"
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          value={content}
          maxLength={20000}
          rows={4}
          disabled={locked || Boolean(file)}
          placeholder="粘贴一段通知，拖入一张截图，或说说你要准备什么…"
          onChange={(event) => {
            setContent(event.target.value);
            setError("");
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length) {
              event.preventDefault();
              selectFile(files);
            }
          }}
        />
        {file && (
          <div className="composer-file">
            <Icon name="paperclip" size={16} />
            <span>
              {file.name} · {formatFileSize(file.size)}
            </span>
            <button
              className="text-button"
              disabled={locked}
              onClick={() => setFile(null)}
            >
              移除
            </button>
          </div>
        )}
        <div className="composer-footer">
          <input
            ref={inputRef}
            type="file"
            aria-label="选择原文件"
            className="sr-only"
            tabIndex={-1}
            accept={FILE_ACCEPT}
            onChange={(event) => {
              selectFile(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
          <button
            className="button secondary"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="paperclip" size={16} />
            上传文件 / 图片
          </button>
          <span role="status">
            {busy
              ? "AI 正在理解与整理…"
              : result || manualMode
                ? "核对下方建议，确认后才保存"
                : aiConfigured
                  ? "输入后自动整理"
                  : "可直接手动添加"}
          </span>
        </div>
      </div>
      <p className="composer-hint">
        {aiConfigured ? (
          "内容会发送至已配置的 AI 服务；保存前可修改或取消。"
        ) : (
          <>
            尚未配置 AI。<Link href="/settings">前往 AI 设置</Link>
            ，或先手动添加。
          </>
        )}{" "}
        支持单个文件，最大 10 MB。
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}{" "}
          <button
            className="text-button"
            disabled={busy || !aiConfigured}
            onClick={() => setRetry((value) => value + 1)}
          >
            重新整理
          </button>
        </p>
      )}
      {!content && !file && !result && !manualMode && (
        <div className="home-examples">
          <span>试着发给我</span>
          {[
            "明天记得缴水费",
            "帮我列一份周末露营准备清单",
            "净水器滤芯型号是 ABC-100，留作参考",
          ].map((text) => (
            <button key={text} onClick={() => setContent(text)}>
              {text}
              <Icon name="arrow" size={14} />
            </button>
          ))}
        </div>
      )}
      {(result || cards.length > 0) && (
        <div ref={resultRef} tabIndex={-1} className="home-results">
          <div className="section-heading">
            <div>
              <p className="eyebrow">READY FOR YOUR REVIEW</p>
              <h2>帮你整理好了</h2>
            </div>
            <span>
              {cards.filter((card) => card.status === "pending").length}{" "}
              条待确认
            </span>
          </div>
          {result?.message && (
            <p className="result-message">{result.message}</p>
          )}
          {file && isImageFile(file.name) && (
            <details className="home-source">
              <summary>查看原图，对照识别结果</summary>
              <ImagePreview file={file} />
            </details>
          )}
          {result?.content && (
            <details className="home-source">
              <summary>
                查看{file && isImageFile(file.name) ? "识别文字" : "原始内容"}
              </summary>
              <pre>{result.content}</pre>
            </details>
          )}
          {cards.length === 0 && (
            <p className="result-message">
              没有生成可保存的记录。你可以补充内容，或去{" "}
              <Link href="/library">资料库搜索</Link>。
            </p>
          )}
          <div className="home-drafts">
            {cards.map((card) => (
              <HomeDraftCard
                key={card.id}
                card={card}
                file={file}
                onUpdate={(value) =>
                  setCards((current) =>
                    current.map((row) => (row.id === value.id ? value : row)),
                  )
                }
                onSaved={onSaved}
                onBusy={(value) =>
                  setSavingCount((count) => count + (value ? 1 : -1))
                }
              />
            ))}
          </div>
          <button
            className="button secondary next-input"
            disabled={busy || savingCount > 0}
            onClick={reset}
          >
            {settled ? "继续输入下一件事" : "清空，重新输入"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
      <div className="manual-actions">
        <span>也可以手动添加</span>
        <button
          className="text-button"
          disabled={busy || savingCount > 0}
          onClick={() => addManual("todo")}
        >
          待办
        </button>
        <button
          className="text-button"
          disabled={busy || savingCount > 0}
          onClick={() => addManual("checklist")}
        >
          清单
        </button>
        <button
          className="text-button"
          disabled={busy || savingCount > 0 || Boolean(result) || manualMode}
          onClick={() => setManualDocument(true)}
        >
          资料
        </button>
        {!result && !manualMode && (content || file) && (
          <button className="text-button" disabled={busy} onClick={reset}>
            清空输入
          </button>
        )}
      </div>
      {manualDocument && (
        <DocumentDialog
          mode="create"
          initial={{ content }}
          initialFile={file}
          aiConfigured={aiConfigured}
          onClose={closeManual}
          onChanged={() => {
            closeManual();
            setContent("");
            setFile(null);
            onSaved();
          }}
        />
      )}
    </section>
  );
}
