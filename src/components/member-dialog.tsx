"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/client";
import {
  memberSchema,
  type FamilyMember,
  type MemberInput,
} from "@/schemas/health";
import { Icon } from "./icon";

export function MemberDialog({
  member,
  onClose,
  onChanged,
}: {
  member?: FamilyMember;
  onClose: () => void;
  onChanged: (message: string, member?: FamilyMember) => void;
}) {
  const [baseline] = useState<MemberInput>(() =>
    member
      ? {
          name: member.name,
          relationship: member.relationship,
          birthDate: member.birthDate,
          allergies: member.allergies,
          conditions: member.conditions,
          notes: member.notes,
        }
      : memberSchema.parse({ name: "新成员" }),
  );
  const [draft, setDraft] = useState<MemberInput>(() =>
    member ? baseline : { ...baseline, name: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(member ? baseline : { ...baseline, name: "" });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  function close() {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const validation = memberSchema.safeParse(draft);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "请检查成员信息");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<FamilyMember>(
        member ? `/api/health/members/${member.id}` : "/api/health/members",
        {
          method: member ? "PUT" : "POST",
          body: JSON.stringify(validation.data),
        },
      );
      onChanged(member ? "成员档案已更新" : "家庭成员已添加", result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!member || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/health/members/${member.id}`, {
        method: "DELETE",
      });
      onChanged("成员已移除");
    } catch (error) {
      setError(error instanceof Error ? error.message : "移除失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="document-dialog member-dialog"
      aria-labelledby="member-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="dialog-eyebrow">CARE FOR EVERYONE AT HOME</span>
          <h2 id="member-dialog-title">
            {member ? "编辑成员档案" : "添加家庭成员"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭成员面板"
          disabled={busy}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      {discard ? (
        <div className="confirmation-panel">
          <h3>还有尚未保存的成员信息</h3>
          <p>离开将放弃本次修改。</p>
          <div>
            <button
              className="button secondary"
              onClick={() => setDiscard(false)}
            >
              继续编辑
            </button>
            <button className="button danger" onClick={onClose}>
              放弃修改并关闭
            </button>
          </div>
        </div>
      ) : (
        <form className="document-form" onSubmit={save}>
          <div className="dialog-body">
            <p className="form-intro">
              用熟悉的称呼建立档案。除称呼外都可留空，之后慢慢补充。
            </p>
            <fieldset disabled={busy}>
              <div className="health-field-grid">
                <div className="field">
                  <label htmlFor="member-name">姓名 / 称呼 *</label>
                  <input
                    id="member-name"
                    required
                    maxLength={40}
                    placeholder="例如：妈妈、小满"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="member-relationship">与我的关系</label>
                  <input
                    id="member-relationship"
                    maxLength={30}
                    placeholder="例如：本人、母亲、孩子"
                    value={draft.relationship}
                    onChange={(e) =>
                      setDraft({ ...draft, relationship: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="member-birth">出生日期</label>
                  <input
                    id="member-birth"
                    type="date"
                    value={draft.birthDate}
                    onChange={(e) =>
                      setDraft({ ...draft, birthDate: e.target.value })
                    }
                  />
                </div>
              </div>
              {(
                [
                  ["allergies", "已知过敏史", 1000],
                  ["conditions", "既往病史 / 慢性病", 1000],
                  ["notes", "其他健康备注", 2000],
                ] as const
              ).map(([key, label, max]) => (
                <div className="field" key={key}>
                  <label htmlFor={`member-${key}`}>{label}</label>
                  <textarea
                    id={`member-${key}`}
                    rows={2}
                    maxLength={max}
                    placeholder="按已知情况填写，未知可留空"
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
            </fieldset>
            {member && (
              <div className="member-delete-area">
                <button
                  type="button"
                  className="text-button delete-button"
                  disabled={busy || member.recordCount > 0}
                  onClick={() => setDeleteConfirm(true)}
                >
                  移除成员
                </button>
                <p className="file-import-hint">
                  {member.recordCount
                    ? `该成员有 ${member.recordCount} 条健康记录。请先转移或删除记录，再移除成员。`
                    : "移除成员不会影响其他家庭成员。"}
                </p>
              </div>
            )}
            {deleteConfirm && (
              <div className="delete-confirm" role="alert">
                <h4>确定移除「{member?.name}」？</h4>
                <p>成员档案将被删除，无法在应用内恢复。</p>
                <div>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => setDeleteConfirm(false)}
                  >
                    保留成员
                  </button>
                  <button
                    type="button"
                    className="button danger small"
                    disabled={busy}
                    onClick={remove}
                  >
                    确认移除成员
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <span>信息仅保存在本机资料库</span>
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={close}
              >
                取消
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "正在保存…" : "保存成员"}
              </button>
            </div>
          </div>
        </form>
      )}
    </dialog>
  );
}
