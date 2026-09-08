"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  type Category,
  type DocumentInput,
  type FamilyDocument,
  type LibraryData,
} from "@/schemas/document";
import { Icon } from "./icon";
import { DocumentDialog } from "./document-dialog";
import { CATEGORY_META } from "./categories";
import { apiRequest } from "@/lib/client";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

const emptyLibrary: LibraryData = {
  documents: [],
  total: 0,
  counts: { 家庭事务: 0, 物品资料: 0, 实用知识: 0, 重要安排: 0, 健康档案: 0 },
};

export function KnowledgeWorkspace({
  aiConfigured,
}: {
  aiConfigured: boolean;
}) {
  const [library, setLibrary] = useState<LibraryData>(emptyLibrary);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<
    | { mode: "create"; initial?: Partial<DocumentInput> }
    | { mode: "view"; document: FamilyDocument }
    | null
  >(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      const params = new URLSearchParams({ q: query });
      if (category !== "all") params.set("category", category);
      try {
        const data = await apiRequest<LibraryData>(`/api/documents?${params}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setLibrary(data);
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : "资料加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, category, revision]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k" && !dialog) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialog]);

  const rememberTrigger = () => {
    triggerRef.current = document.activeElement as HTMLElement;
  };
  function create(initial?: Partial<DocumentInput>) {
    rememberTrigger();
    requestSequence.current++;
    setOpeningId(null);
    setDialog({
      mode: "create",
      initial: { ...(category === "all" ? {} : { category }), ...initial },
    });
  }
  async function open(id: string) {
    rememberTrigger();
    const sequence = ++requestSequence.current;
    setOpeningId(id);
    try {
      const document = await apiRequest<FamilyDocument>(`/api/documents/${id}`);
      if (sequence === requestSequence.current)
        setDialog({ mode: "view", document });
    } catch (error) {
      if (sequence === requestSequence.current)
        setToast(error instanceof Error ? error.message : "资料打开失败");
    } finally {
      if (sequence === requestSequence.current) setOpeningId(null);
    }
  }
  const closeDialog = useCallback(() => {
    setDialog(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  function onChanged(message: string) {
    setRevision((value) => value + 1);
    setToast(message);
    closeDialog();
  }
  const selectedMeta = category === "all" ? null : CATEGORY_META[category];

  return (
    <div className="workspace">
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
          我的家庭<span className="home-label-badge">个人空间</span>
        </div>
        <nav aria-label="资料分类">
          <Link className="nav-item" href="/health">
            <Icon name="heart" />
            <span>家庭健康</span>
            <Icon name="chevron" size={14} />
          </Link>
          <p className="nav-caption">我的资料</p>
          <button
            className={`nav-item ${category === "all" ? "active" : ""}`}
            aria-current={category === "all" ? "page" : undefined}
            onClick={() => {
              if (category !== "all") setLoading(true);
              setCategory("all");
            }}
          >
            <Icon name="library" />
            <span>全部资料</span>
            <span className="nav-count">{library.total}</span>
          </button>
          <p className="nav-caption categories-caption">分类</p>
          {CATEGORIES.map((item) => (
            <button
              key={item}
              className={`nav-item ${category === item ? "active" : ""}`}
              aria-current={category === item ? "page" : undefined}
              onClick={() => {
                if (category !== item) setLoading(true);
                setCategory(item);
              }}
            >
              <Icon name={CATEGORY_META[item].icon} />
              <span>{item}</span>
              <span className="nav-count">{library.counts[item]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="book" size={19} />
            <p>好记性，也有一个好住处。</p>
            <span>慢慢积累属于家的知识。</span>
          </div>
          <div className="sidebar-version">
            <span>家庭资料库</span>
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
            <strong>资料库</strong>
          </div>
          <span className="topbar-label">
            <span className="home-dot" />
            把日常，认真收藏
          </span>
        </header>
        <main className="main-content">
          <div className="workspace-tabs">
            <Link href="/" aria-current="page">
              家庭资料库
            </Link>
            <Link href="/health">
              家庭健康 <Icon name="heart" size={14} />
            </Link>
          </div>
          <section className="page-heading">
            <div>
              <p className="eyebrow">YOUR FAMILY, WELL DOCUMENTED</p>
              <h1>
                家里的事，有处可寻<span className="heading-dot">。</span>
              </h1>
              <p className="page-description">
                留住重要信息，也留住让生活更从容的小经验。
              </p>
            </div>
            <button
              className="button primary new-document"
              onClick={() => create()}
            >
              <Icon name="plus" size={18} />
              新增资料
            </button>
          </section>

          <section className="library-overview" aria-label="资料库概览">
            <div className="overview-intro">
              <span className="overview-icon">
                <Icon name="library" size={25} />
              </span>
              <div>
                <p>一点点积累，一次次省心</p>
                <span>
                  你的家庭资料库，已经收藏 <strong>{library.total}</strong>{" "}
                  条资料
                </span>
              </div>
            </div>
            <div className="overview-divider" />
            <div className="overview-tip">
              <Icon name="sparkle" size={20} />
              <p>
                不知道怎么整理？<span>粘贴原文，让 AI 帮你提炼重点。</span>
              </p>
            </div>
            <div className="overview-decoration" aria-hidden="true">
              <div />
              <div />
              <div />
            </div>
          </section>

          <div className="library-toolbar">
            <div className="library-title">
              <span
                className={
                  selectedMeta ? `category-mini ${selectedMeta.tone}` : ""
                }
              >
                <Icon name={selectedMeta?.icon || "library"} size={19} />
              </span>
              <h2>{category === "all" ? "全部资料" : category}</h2>
              <span className="result-count">{library.documents.length}</span>
            </div>
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                ref={searchRef}
                aria-label="搜索资料"
                placeholder="搜索标题、正文或标签…"
                maxLength={200}
                value={query}
                onChange={(event) => {
                  setLoading(true);
                  setQuery(event.target.value);
                }}
              />
              {query ? (
                <button
                  className="search-clear"
                  aria-label="清空搜索"
                  onClick={() => {
                    setLoading(true);
                    setQuery("");
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </label>
          </div>
          <div className="list-subheader">
            <p>
              {query
                ? `搜索「${query}」`
                : selectedMeta?.description ||
                  "把散落的信息，整理成随时用得上的资料。"}
            </p>
            <span>
              <Icon name="clock" size={13} />
              最近更新
            </span>
          </div>
          <div className="mobile-categories">
            <label className="sr-only" htmlFor="mobile-category">
              选择分类
            </label>
            <select
              id="mobile-category"
              value={category}
              onChange={(event) => {
                setLoading(true);
                setCategory(event.target.value as Category | "all");
              }}
            >
              <option value="all">全部资料</option>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          {loadError ? (
            <div className="empty-state error-state" role="alert">
              <Icon name="file" size={35} />
              <h3>资料暂时没有加载出来</h3>
              <p>{loadError}</p>
              <button
                className="button secondary"
                onClick={() => setRevision((value) => value + 1)}
              >
                重试
              </button>
            </div>
          ) : loading ? (
            <div
              className="document-grid"
              aria-label="正在加载资料"
              aria-busy="true"
            >
              {[1, 2, 3].map((item) => (
                <div className="document-card skeleton" key={item}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : library.documents.length ? (
            <div className="document-grid">
              {library.documents.map((document) => {
                const meta = CATEGORY_META[document.category];
                return (
                  <button
                    key={document.id}
                    className="document-card"
                    onClick={() => open(document.id)}
                    disabled={openingId === document.id}
                    aria-label={`查看资料：${document.title}`}
                  >
                    <div className="card-top">
                      <span className={`category-icon ${meta.tone}`}>
                        <Icon name={meta.icon} size={21} />
                      </span>
                      <span className="card-category">{document.category}</span>
                      <Icon name="arrow" size={16} className="card-arrow" />
                    </div>
                    <h3>{document.title}</h3>
                    <p className="card-excerpt">
                      {document.summary || document.excerpt}
                    </p>
                    <div className="card-tags">
                      {document.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                    <div className="card-bottom">
                      <span>
                        {openingId === document.id
                          ? "正在打开…"
                          : `${formatDate(document.updatedAt)} 更新`}
                      </span>
                      <Icon name="file" size={14} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query || category !== "all" ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="search" size={29} />
              </div>
              <h3>
                {query
                  ? "还没有找到匹配的资料"
                  : "这个分类，等待你的第一条收藏"}
              </h3>
              <p>
                {query
                  ? "试试其他关键词，或在全部资料中查找。"
                  : selectedMeta?.description}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  if (query) {
                    setQuery("");
                    setCategory("all");
                    setLoading(true);
                  } else create({ category: category as Category });
                }}
              >
                {query ? "查看全部资料" : "新增一条资料"}
                <Icon name="arrow" size={15} />
              </button>
            </div>
          ) : (
            <section className="welcome-panel">
              <div className="welcome-art" aria-hidden="true">
                <div className="paper paper-back" />
                <div className="paper paper-front">
                  <span className="paper-icon">
                    <Icon name="home" size={23} />
                  </span>
                  <span className="paper-line" />
                  <span className="paper-line short" />
                  <span className="paper-line" />
                  <span className="paper-tag" />
                </div>
                <span className="art-sparkle">
                  <Icon name="sparkle" size={23} />
                </span>
                <span className="art-dot" />
              </div>
              <p className="small-eyebrow">从一条小小的记录开始</p>
              <h3>让重要的事，不再散落各处</h3>
              <p>
                一段维修经验、一个滤芯型号，或一份出行清单。
                <br />
                把它们放在这里，下次需要时，一搜就有。
              </p>
              <button className="button primary" onClick={() => create()}>
                <Icon name="plus" size={17} />
                收藏第一条资料
              </button>
              <span className="welcome-hint">
                直接粘贴文字就好，整理可以交给 AI。
              </span>
            </section>
          )}

          {!query && !loadError && (
            <section className="inspiration">
              <div className="inspiration-heading">
                <h2>不知道从哪里开始？</h2>
                <p>选一种资料，记录生活里值得留下的信息。</p>
              </div>
              <div className="inspiration-grid">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    className="inspiration-item"
                    aria-label={`新增${item}资料`}
                    onClick={() => create({ category: item })}
                  >
                    <span
                      className={`category-icon ${CATEGORY_META[item].tone}`}
                    >
                      <Icon name={CATEGORY_META[item].icon} size={20} />
                    </span>
                    <div>
                      <h3>{item}</h3>
                      <p>{CATEGORY_META[item].description}</p>
                    </div>
                    <Icon name="chevron" size={14} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <footer className="page-footer">
            <Icon name="home" size={13} />
            <span>属于家的信息，值得好好安放。</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <DocumentDialog
          key={dialog.mode === "view" ? dialog.document.id : "create"}
          {...dialog}
          aiConfigured={aiConfigured}
          onClose={closeDialog}
          onChanged={onChanged}
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
