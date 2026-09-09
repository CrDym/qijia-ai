"use client";
import { useId } from "react";
import type { ActivityFields as Fields } from "@/schemas/activity";

export function ActivityFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Fields;
  onChange: (value: Fields) => void;
  disabled?: boolean;
}) {
  const prefix = useId();
  return (
    <fieldset className="activity-fields" disabled={disabled}>
      <div className="field">
        <label htmlFor={`${prefix}-title`}>事项名称</label>
        <input
          id={`${prefix}-title`}
          value={value.title}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
        />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-date`}>日期（选填）</label>
        <input
          id={`${prefix}-date`}
          type="date"
          value={value.dueOn}
          onChange={(event) =>
            onChange({ ...value, dueOn: event.target.value })
          }
        />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-notes`}>备注</label>
        <textarea
          id={`${prefix}-notes`}
          rows={3}
          value={value.notes}
          maxLength={2000}
          onChange={(event) =>
            onChange({ ...value, notes: event.target.value })
          }
        />
      </div>
      {value.kind === "checklist" && (
        <div className="field">
          <span className="field-label">清单条目</span>
          <div className="checklist-edit">
            {value.items.map((item, index) => (
              <div key={item.id}>
                <input
                  aria-label={`第 ${index + 1} 项`}
                  value={item.text}
                  maxLength={200}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      items: value.items.map((row) =>
                        row.id === item.id
                          ? { ...row, text: event.target.value }
                          : row,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="text-button"
                  aria-label={`移除第 ${index + 1} 项`}
                  onClick={() =>
                    onChange({
                      ...value,
                      items: value.items.filter((row) => row.id !== item.id),
                    })
                  }
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            type="button"
            disabled={value.items.length >= 40}
            onClick={() =>
              onChange({
                ...value,
                items: [
                  ...value.items,
                  { id: crypto.randomUUID(), text: "", completed: false },
                ],
              })
            }
          >
            + 添加一项
          </button>
        </div>
      )}
    </fieldset>
  );
}
