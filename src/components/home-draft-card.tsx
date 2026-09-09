"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/client";
import { homeConfirmSchema } from "@/schemas/home";
import type { ActivityInput } from "@/schemas/activity";
import { CATEGORIES, type DocumentInput } from "@/schemas/document";
import { emptyHealthRecord } from "@/schemas/health";
import { ActivityFields } from "./activity-fields";
import { HealthRecordBasics, HealthRecordFields } from "./health-record-fields";
import { Icon } from "./icon";

export type HomeCard = (
  | { kind: "document"; data: DocumentInput }
  | { kind: "activity"; data: ActivityInput }
) & {
  id: string;
  clarification: string;
  status: "pending" | "saved" | "cancelled";
  manual?: boolean;
};

export function HomeDraftCard({
  card,
  file,
  onUpdate,
  onSaved,
  onBusy,
}: {
  card: HomeCard;
  file: File | null;
  onUpdate: (value: HomeCard) => void;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tags, setTags] = useState(
    card.kind === "document" ? card.data.tags.join("，") : "",
  );
  const label =
    card.kind === "document"
      ? "资料"
      : card.data.kind === "todo"
        ? "待办"
        : "清单";
  async function save() {
    if (saving) return;
    setError("");
    const result = homeConfirmSchema.safeParse({
      id: card.id,
      kind: card.kind,
      data:
        card.kind === "document"
          ? {
              ...card.data,
              tags: tags
                .split(/[,，]/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : card.data,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message || "请检查内容");
      return;
    }
    setSaving(true);
    onBusy(true);
    try {
      let body: FormData | string = JSON.stringify(result.data);
      if (file) {
        body = new FormData();
        body.set("card", JSON.stringify(result.data));
        body.set("file", file);
      }
      await apiRequest("/api/home/confirm", { method: "POST", body });
      onUpdate({ ...card, status: "saved" });
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  if (card.status !== "pending")
    return (
      <div className="home-card settled-card">
        <Icon name={card.status === "saved" ? "check" : "close"} size={18} />
        <span>{card.data.title || label}</span>
        <span>{card.status === "saved" ? "已保存" : "已取消"}</span>
      </div>
    );
  return (
    <article className="home-card draft-card" aria-label={`${label}草稿`}>
      <div className="home-card-heading">
        <span className="card-kind">
          <Icon name={card.kind === "document" ? "file" : "check"} size={16} />
          {label}
        </span>
        <span className="muted">待确认</span>
      </div>
      <h3>{card.data.title || `新的${label}`}</h3>
      <p className="card-description">
        {card.kind === "document" ? card.data.summary : card.data.notes}
      </p>
      {card.kind === "document" ? (
        <div className="card-meta">
          {card.data.category} · {card.data.tags.join(" / ") || "无标签"}
        </div>
      ) : (
        <>
          <div className="card-meta">
            <Icon name="calendar" size={14} />
            {card.data.dueOn || "未定日期"}
          </div>
          {card.data.kind === "checklist" && (
            <ul className="draft-items">
              {card.data.items.map((item) => (
                <li key={item.id}>{item.text || "待填写"}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {card.clarification && (
        <p className="file-warning">{card.clarification}</p>
      )}
      {card.kind === "document" && card.data.health && (
        <HealthRecordBasics
          value={card.data.health}
          disabled={saving}
          onChange={(health) =>
            onUpdate({ ...card, data: { ...card.data, health } })
          }
        />
      )}
      <details className="card-edit" open={card.manual || undefined}>
        <summary>调整{label}内容</summary>
        {card.kind === "activity" ? (
          <ActivityFields
            value={card.data}
            disabled={saving}
            onChange={(data) =>
              onUpdate({ ...card, data: { ...card.data, ...data } })
            }
          />
        ) : (
          <fieldset disabled={saving} className="activity-fields">
            <div className="field">
              <label htmlFor={`${card.id}-title`}>标题</label>
              <input
                id={`${card.id}-title`}
                value={card.data.title}
                maxLength={100}
                onChange={(event) =>
                  onUpdate({
                    ...card,
                    data: { ...card.data, title: event.target.value },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`${card.id}-summary`}>摘要</label>
              <textarea
                id={`${card.id}-summary`}
                value={card.data.summary}
                maxLength={500}
                rows={3}
                onChange={(event) =>
                  onUpdate({
                    ...card,
                    data: { ...card.data, summary: event.target.value },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`${card.id}-category`}>分类</label>
              <select
                id={`${card.id}-category`}
                value={card.data.category}
                onChange={(event) => {
                  const category = event.target
                    .value as DocumentInput["category"];
                  onUpdate({
                    ...card,
                    data: {
                      ...card.data,
                      category,
                      health:
                        category === "健康档案"
                          ? (card.data.health ?? emptyHealthRecord())
                          : null,
                    },
                  });
                }}
              >
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${card.id}-tags`}>标签（逗号分隔）</label>
              <input
                id={`${card.id}-tags`}
                value={tags}
                maxLength={200}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${card.id}-content`}>正文 / 识别文字</label>
              <textarea
                id={`${card.id}-content`}
                value={card.data.content}
                maxLength={20000}
                rows={7}
                onChange={(event) =>
                  onUpdate({
                    ...card,
                    data: { ...card.data, content: event.target.value },
                  })
                }
              />
            </div>
            {card.data.health && (
              <HealthRecordFields
                value={card.data.health}
                disabled={saving}
                onChange={(health) =>
                  onUpdate({ ...card, data: { ...card.data, health } })
                }
              />
            )}
          </fieldset>
        )}
      </details>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-actions">
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={() => onUpdate({ ...card, status: "cancelled" })}
        >
          取消这条
        </button>
        <button
          type="button"
          className="button primary"
          disabled={saving}
          onClick={save}
        >
          {saving ? "保存中…" : "确认保存"}
        </button>
      </div>
    </article>
  );
}
