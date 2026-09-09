"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client";
import type {
  DocumentInput,
  FamilyDocument,
  LibraryData,
  DocumentPreview,
} from "@/schemas/document";
import {
  emptyHealthRecord,
  RECORD_TYPES,
  type FamilyMember,
} from "@/schemas/health";
import { Icon } from "./icon";
import { DocumentDialog } from "./document-dialog";
import { MemberDialog } from "./member-dialog";

export function HealthWorkspace({ aiConfigured }: { aiConfigured: boolean }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [documents, setDocuments] = useState<DocumentPreview[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [recordType, setRecordType] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [memberDialog, setMemberDialog] = useState<{
    member?: FamilyMember;
  } | null>(null);
  const [documentDialog, setDocumentDialog] = useState<
    | { mode: "create"; initial: Partial<DocumentInput> }
    | { mode: "view"; document: FamilyDocument }
    | null
  >(null);
  const [opening, setOpening] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const selected = members.find((member) => member.id === selectedId);
  const visible = documents.filter(
    (document) => !recordType || document.health?.recordType === recordType,
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ category: "健康档案", q: query });
      if (selectedId) params.set("memberId", selectedId);
      try {
        const [people, records] = await Promise.all([
          apiRequest<FamilyMember[]>("/api/health/members", {
            signal: controller.signal,
          }),
          apiRequest<LibraryData>(`/api/documents?${params}`, {
            signal: controller.signal,
          }),
        ]);
        if (!controller.signal.aborted) {
          setMembers(people);
          setDocuments(records.documents);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "健康档案加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selectedId, query, revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function remember() {
    trigger.current = document.activeElement as HTMLElement;
  }
  function close() {
    setDocumentDialog(null);
    setMemberDialog(null);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }
  function changed(message: string) {
    setToast(message);
    setRevision((x) => x + 1);
    close();
  }
  async function openDocument(id: string) {
    if (opening) return;
    remember();
    setOpening(true);
    setError("");
    try {
      setDocumentDialog({
        mode: "view",
        document: await apiRequest<FamilyDocument>(`/api/documents/${id}`),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "记录打开失败");
    } finally {
      setOpening(false);
    }
  }
  function createRecord() {
    remember();
    setDocumentDialog({
      mode: "create",
      initial: {
        category: "健康档案",
        health: emptyHealthRecord(
          selectedId || (members.length === 1 ? members[0].id : ""),
        ),
      },
    });
  }
  return (
    <div className="workspace health-workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="栖家首页">
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
        <nav aria-label="家庭工具">
          <p className="nav-caption">家庭工作台</p>
          <Link className="nav-item" href="/">
            <Icon name="home" />
            <span>今日生活</span>
          </Link>
          <Link className="nav-item" href="/library">
            <Icon name="library" />
            <span>家庭资料库</span>
          </Link>
          <Link className="nav-item active" href="/health" aria-current="page">
            <Icon name="heart" />
            <span>家庭健康</span>
          </Link>
          <Link className="nav-item" href="/settings">
            <Icon name="settings" />
            <span>AI 设置</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="heart" size={19} />
            <p>把关心，放进每一份记录。</p>
            <span>重要的健康信息，随时可寻。</span>
          </div>
          <div className="sidebar-version">
            <span>家庭健康档案</span>
            <span>V0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="home" size={16} />
            <span>我的家庭</span>
            <Icon name="chevron" size={12} />
            <strong>家庭健康</strong>
          </div>
          <span className="topbar-label">照顾好每一个家人</span>
        </header>
        <main className="main-content">
          <div className="workspace-tabs">
            <Link href="/">今日生活</Link>
            <Link href="/library">家庭资料库</Link>
            <Link href="/health" aria-current="page">
              家庭健康 <Icon name="heart" size={14} />
            </Link>
            <Link href="/settings">AI 设置</Link>
          </div>
          <section className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE CARE, ALWAYS HERE</p>
              <h1>
                家人的健康，认真记着<span className="heading-dot">。</span>
              </h1>
              <p className="page-description">
                让散落的病历、报告与医嘱，成为一份有序的健康档案。
              </p>
            </div>
            <button
              className="button primary"
              onClick={createRecord}
              disabled={!members.length || loading}
            >
              <Icon name="plus" size={18} />
              新增健康记录
            </button>
          </section>
          <section className="health-overview">
            <span className="overview-icon">
              <Icon name="heart" size={26} />
            </span>
            <div>
              <h2>留好记录，就诊时多一份从容</h2>
              <p>
                {members.length
                  ? `已建立 ${members.length} 位家人的档案，保存 ${members.reduce((n, member) => n + member.recordCount, 0)} 条健康记录。`
                  : "从添加一位家人开始，逐步收好每一次就诊资料。"}
              </p>
            </div>
            <span className="health-overview-note">
              原件保留 · 按人归档 · 日期回顾
            </span>
          </section>
          <section className="family-members" aria-label="家庭成员">
            <div className="section-heading">
              <h2>我的家人</h2>
              <button
                className="button secondary small"
                onClick={() => {
                  remember();
                  setMemberDialog({});
                }}
              >
                <Icon name="plus" size={15} />
                添加成员
              </button>
            </div>
            {!members.length && !loading && !error ? (
              <div className="health-empty">
                <Icon name="heart" size={34} />
                <h3>先为家人建一个档案</h3>
                <p>填写称呼即可开始，过敏史和既往病史可以之后补充。</p>
                <button
                  className="button primary"
                  onClick={() => {
                    remember();
                    setMemberDialog({});
                  }}
                >
                  添加第一位成员
                </button>
              </div>
            ) : (
              <div className="member-cards">
                <button
                  className={`member-card all-members ${!selectedId ? "selected" : ""}`}
                  aria-pressed={!selectedId}
                  onClick={() => {
                    if (selectedId) setLoading(true);
                    setSelectedId("");
                  }}
                >
                  <span className="member-avatar">
                    <Icon name="home" size={21} />
                  </span>
                  <strong>全部家人</strong>
                  <span>{members.length} 位成员</span>
                </button>
                {members.map((member, index) => (
                  <button
                    key={member.id}
                    className={`member-card ${selectedId === member.id ? "selected" : ""}`}
                    aria-pressed={selectedId === member.id}
                    onClick={() => {
                      if (selectedId !== member.id) setLoading(true);
                      setSelectedId(member.id);
                    }}
                  >
                    <span className={`member-avatar avatar-${index % 3}`}>
                      {Array.from(member.name)[0]}
                    </span>
                    <strong>{member.name}</strong>
                    <span>
                      {member.relationship || "家庭成员"} · {member.recordCount}{" "}
                      条记录
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {selected && (
            <section className="member-profile" aria-label="成员健康概况">
              <div className="section-heading">
                <div>
                  <h2>{selected.name}的健康概况</h2>
                  <p>
                    {selected.birthDate
                      ? `出生日期：${selected.birthDate}`
                      : "出生日期未填写"}
                  </p>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => {
                    remember();
                    setMemberDialog({ member: selected });
                  }}
                >
                  <Icon name="edit" size={14} />
                  编辑成员
                </button>
              </div>
              <dl>
                <div>
                  <dt>已知过敏史</dt>
                  <dd>{selected.allergies || "未填写"}</dd>
                </div>
                <div>
                  <dt>既往病史 / 慢性病</dt>
                  <dd>{selected.conditions || "未填写"}</dd>
                </div>
                {selected.notes && (
                  <div>
                    <dt>健康备注</dt>
                    <dd>{selected.notes}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          <section className="health-history" aria-label="健康记录">
            <div className="section-heading">
              <h2>
                {selected ? `${selected.name}的健康记录` : "全部健康记录"}
              </h2>
              <span className="health-sort-hint">
                按记录日期从新到旧 · 未填日期排在末尾
              </span>
            </div>
            <div className="health-toolbar">
              <label className="search-box">
                <Icon name="search" size={17} />
                <input
                  aria-label="搜索健康记录"
                  placeholder="搜索病历、医院、药名…"
                  maxLength={200}
                  value={query}
                  onChange={(e) => {
                    setLoading(true);
                    setQuery(e.target.value);
                  }}
                />
              </label>
              <select
                aria-label="筛选记录类型"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
              >
                <option value="">全部类型</option>
                {RECORD_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            {error ? (
              <div className="inline-error" role="alert">
                {error}{" "}
                <button
                  className="text-button"
                  onClick={() => setRevision((x) => x + 1)}
                >
                  重新加载
                </button>
              </div>
            ) : loading ? (
              <div className="health-loading" role="status">
                <span className="spinner" />
                正在读取健康档案…
              </div>
            ) : !visible.length ? (
              <div className="health-empty compact">
                <Icon name="file" size={28} />
                <h3>
                  {query || recordType
                    ? "没有找到匹配的健康记录"
                    : "这里会记下每一次健康记录"}
                </h3>
                <p>
                  {query || recordType
                    ? "试试其他关键词或记录类型。"
                    : "上传病历照片、PDF 报告，或直接写下原文记录。"}
                </p>
                {members.length > 0 && !query && !recordType && (
                  <button
                    className="button secondary small"
                    onClick={createRecord}
                  >
                    新增健康记录
                  </button>
                )}
              </div>
            ) : (
              <div className="health-timeline">
                {visible.map((record) => (
                  <button
                    className="health-record-card"
                    key={record.id}
                    disabled={opening}
                    onClick={() => void openDocument(record.id)}
                  >
                    <div className="record-date">
                      <Icon name="calendar" size={16} />
                      <span>{record.health?.occurredOn || "日期未填"}</span>
                    </div>
                    <div className="record-card-content">
                      <div className="record-card-labels">
                        <span>
                          {members.find(
                            (member) => member.id === record.health?.memberId,
                          )?.name || "未知成员"}
                        </span>
                        <span>{record.health?.recordType}</span>
                        {record.attachment && (
                          <Icon name="paperclip" size={13} />
                        )}
                      </div>
                      <h3>{record.title}</h3>
                      <p>{record.summary || record.excerpt}</p>
                      {record.health?.hospital && (
                        <span className="record-hospital">
                          {record.health.hospital}
                        </span>
                      )}
                    </div>
                    <Icon name="chevron" size={17} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <footer className="health-footer">
            健康档案用于保存与整理资料。AI
            结果请与原件核对，诊疗和用药以医生意见为准。
          </footer>
        </main>
      </div>
      {memberDialog && (
        <MemberDialog
          {...memberDialog}
          onClose={close}
          onChanged={(message, member) => {
            setSelectedId(member?.id ?? "");
            changed(message);
          }}
        />
      )}
      {documentDialog && (
        <DocumentDialog
          {...documentDialog}
          aiConfigured={aiConfigured}
          onClose={close}
          onChanged={changed}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
