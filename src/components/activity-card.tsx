"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/client";
import {
  activitySchema,
  type Activity,
  type ActivityFields as Fields,
} from "@/schemas/activity";
import { ActivityFields } from "./activity-fields";
import { Icon } from "./icon";
import { useConfirmation } from "./confirmation-provider";

export function ActivityCard({
  activity,
  editing,
  onEdit,
  onUpdated,
  onRemoved,
}: {
  activity: Activity;
  editing: boolean;
  onEdit: (value: boolean) => void;
  onUpdated: (value: Activity) => void;
  onRemoved: () => void;
}) {
  const confirm = useConfirmation();
  const [draft, setDraft] = useState<Fields>({
    kind: activity.kind,
    title: activity.title,
    notes: activity.notes,
    dueOn: activity.dueOn,
    items: activity.items,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingToggle, setPendingToggle] = useState<{
    completed: boolean;
    itemId?: string;
  } | null>(null);
  const shownItems = activity.items.map((item) =>
    pendingToggle && (!pendingToggle.itemId || pendingToggle.itemId === item.id)
      ? { ...item, completed: pendingToggle.completed }
      : item,
  );
  const shownCompleted = pendingToggle
    ? activity.kind === "checklist"
      ? shownItems.every((item) => item.completed)
      : pendingToggle.completed
    : activity.completed;
  function toggle(completed: boolean, itemId?: string) {
    if (busy) return;
    const value = { completed, ...(itemId ? { itemId } : {}) };
    setPendingToggle(value);
    void mutate("PATCH", value);
  }
  async function mutate(method: "PUT" | "PATCH" | "DELETE", data?: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await apiRequest<Activity>(
        `/api/activities/${activity.id}`,
        { method, ...(data ? { body: JSON.stringify(data) } : {}) },
      );
      if (method === "DELETE") onRemoved();
      else onUpdated(value);
      onEdit(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败，请重试");
    } finally {
      setPendingToggle(null);
      setBusy(false);
    }
  }
  function save() {
    const result = activitySchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message || "请检查内容");
      return;
    }
    void mutate("PUT", result.data);
  }
  async function cancelEdit() {
    if (
      JSON.stringify(draft) !==
        JSON.stringify({
          kind: activity.kind,
          title: activity.title,
          notes: activity.notes,
          dueOn: activity.dueOn,
          items: activity.items,
        }) &&
      !(await confirm("放弃这条事项尚未保存的修改吗？"))
    )
      return;
    onEdit(false);
    setError("");
  }
  return (
    <article
      className={`home-card activity-card ${activity.completed ? "is-complete" : ""}`}
      aria-label={activity.title}
    >
      <div className="activity-title">
        <input
          type="checkbox"
          aria-label={`${activity.completed ? "重新打开" : "完成"}${activity.title}`}
          checked={shownCompleted}
          disabled={busy || editing}
          onChange={(event) => toggle(event.target.checked)}
        />
        <h3>{activity.title}</h3>
        <span className="card-kind">
          {activity.kind === "todo" ? "待办" : "清单"}
        </span>
      </div>
      <div className="card-meta">
        <Icon name="calendar" size={14} />
        {activity.dueOn || "未定日期"}
        {activity.kind === "checklist" && (
          <span>
            {" "}
            · {shownItems.filter((item) => item.completed).length}/
            {activity.items.length} 已准备
          </span>
        )}
      </div>
      {editing ? (
        <>
          <ActivityFields value={draft} onChange={setDraft} disabled={busy} />
          <div className="card-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={cancelEdit}
            >
              取消编辑
            </button>
            <button className="button primary" disabled={busy} onClick={save}>
              {busy ? "保存中…" : "保存修改"}
            </button>
          </div>
        </>
      ) : (
        <>
          {activity.notes && (
            <p className="card-description">{activity.notes}</p>
          )}
          {activity.kind === "checklist" && (
            <ul className="activity-items">
              {shownItems.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      disabled={busy}
                      onChange={(event) =>
                        toggle(event.target.checked, item.id)
                      }
                    />
                    <span className={item.completed ? "checked-text" : ""}>
                      {item.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {(activity.sourceContent || activity.attachment) && (
            <details className="home-source">
              <summary>
                查看来源{activity.source ? ` · ${activity.source}` : ""}
              </summary>
              {activity.sourceContent && <pre>{activity.sourceContent}</pre>}
              {activity.attachment && (
                <a
                  href={`/api/activities/${activity.id}/file`}
                  download
                  className="text-button"
                >
                  下载原文件：{activity.attachment.name}
                </a>
              )}
            </details>
          )}
          <div className="activity-tools">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDraft({
                  kind: activity.kind,
                  title: activity.title,
                  notes: activity.notes,
                  dueOn: activity.dueOn,
                  items: activity.items,
                });
                onEdit(true);
              }}
            >
              编辑
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm(
                    `删除“${activity.title}”？原文件也会删除，此操作无法撤销。`,
                    {
                      title: "删除这条事项？",
                      confirmLabel: "删除事项",
                      danger: true,
                    },
                  )
                )
                  void mutate("DELETE");
              }}
            >
              删除
            </button>
            {busy && <span role="status">正在更新…</span>}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </article>
  );
}
