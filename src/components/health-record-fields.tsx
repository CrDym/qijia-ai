"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client";
import {
  RECORD_TYPES,
  type FamilyMember,
  type HealthRecord,
} from "@/schemas/health";

export const HEALTH_TEXT_FIELDS = [
  ["hospital", "就诊 / 检查机构", 100],
  ["diagnosis", "原文诊断 / 检查结论", 2000],
  ["medications", "原文处方 / 用药", 2000],
  ["followUp", "原文医嘱 / 复诊安排", 2000],
] as const;

type HealthFieldProps = {
  value: HealthRecord;
  onChange: (value: HealthRecord) => void;
  disabled: boolean;
};

export function HealthRecordBasics({
  value,
  onChange,
  disabled,
}: HealthFieldProps) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<FamilyMember[]>("/api/health/members", {
      signal: controller.signal,
    })
      .then(setMembers)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <fieldset
      className="health-record-basics"
      aria-label="健康记录基本信息"
      disabled={disabled}
    >
      <div className="health-section-heading">
        <h3>记录信息</h3>
        <span>归档到家庭健康</span>
      </div>
      <div className="health-field-grid">
        <div className="field">
          <label htmlFor="health-member">所属家庭成员 *</label>
          <select
            id="health-member"
            required
            disabled={!loaded || Boolean(error)}
            value={value.memberId}
            onChange={(event) =>
              onChange({ ...value, memberId: event.target.value })
            }
          >
            <option value="">{loaded ? "请选择成员" : "正在加载成员…"}</option>
            {members.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
                {member.relationship ? ` · ${member.relationship}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="health-type">记录类型</label>
          <select
            id="health-type"
            value={value.recordType}
            onChange={(event) =>
              onChange({
                ...value,
                recordType: event.target.value as HealthRecord["recordType"],
              })
            }
          >
            {RECORD_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="health-date">记录日期</label>
          <input
            id="health-date"
            type="date"
            value={value.occurredOn}
            onChange={(event) =>
              onChange({ ...value, occurredOn: event.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="health-hospital">就诊 / 检查机构</label>
          <input
            id="health-hospital"
            maxLength={100}
            value={value.hospital}
            placeholder="例如：社区医院，未提供可留空"
            onChange={(event) =>
              onChange({ ...value, hospital: event.target.value })
            }
          />
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              setRevision((x) => x + 1);
            }}
          >
            重试
          </button>
        </p>
      )}
      {loaded && !error && !members.length && (
        <p className="file-warning">
          请先在{" "}
          <Link href="/health" target="_blank" rel="noopener noreferrer">
            家庭健康
          </Link>{" "}
          新增成员，然后{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setRevision((x) => x + 1)}
          >
            刷新成员列表
          </button>
          。
        </p>
      )}
    </fieldset>
  );
}

export function HealthRecordFields({
  value,
  onChange,
  disabled,
}: HealthFieldProps) {
  return (
    <fieldset
      className="health-record-fields"
      aria-label="原文健康信息"
      disabled={disabled}
    >
      <div className="health-section-heading">
        <h3>原文健康信息</h3>
        <span>选填，原文未提供的信息可以留空</span>
      </div>
      {HEALTH_TEXT_FIELDS.filter(([key]) => key !== "hospital").map(
        ([key, label, max]) => (
          <div className="field" key={key}>
            <label htmlFor={`health-${key}`}>{label}</label>
            <textarea
              id={`health-${key}`}
              rows={2}
              value={value[key]}
              maxLength={max}
              placeholder="仅记录原文信息，不确定时留空"
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
            />
          </div>
        ),
      )}
    </fieldset>
  );
}

export function HealthRecordDetails({ value }: { value: HealthRecord }) {
  const [name, setName] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<FamilyMember[]>("/api/health/members", {
      signal: controller.signal,
    })
      .then((members) =>
        setName(
          members.find((member) => member.id === value.memberId)?.name ??
            "未知成员",
        ),
      )
      .catch(() => setName("成员信息暂时不可用"));
    return () => controller.abort();
  }, [value.memberId]);
  return (
    <section className="health-record-details">
      <h4>
        {name || "正在读取成员…"} · {value.recordType}
      </h4>
      <p>{value.occurredOn || "日期未填写"}</p>
      <dl>
        {HEALTH_TEXT_FIELDS.filter(([key]) => value[key]).map(
          ([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value[key]}</dd>
            </div>
          ),
        )}
      </dl>
      <p className="file-import-hint">
        以上为录入的资料内容，请以原始病历与医生意见为准。
      </p>
    </section>
  );
}
