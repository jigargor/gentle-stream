"use client";

import { useEffect, useId, useRef, useState } from "react";

interface FreeComboBoxProps {
  /** Predefined options shown in the dropdown. */
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** If provided, label each option with this function instead of the raw string. */
  optionLabel?: (opt: string) => string;
}

export function FreeComboBox({
  options,
  value,
  onChange,
  placeholder,
  className = "creator-input",
  optionLabel,
}: FreeComboBoxProps) {
  const id = useId();
  const listId = id + "-list";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync query when value prop changes externally
  useEffect(() => {
    setQuery(optionLabel ? (options.find((o) => o === value) ? optionLabel(value) : value) : value);
  }, [value, options, optionLabel]);

  const label = (opt: string) => (optionLabel ? optionLabel(opt) : opt);

  const filtered = options.filter((o) =>
    label(o).toLowerCase().includes(query.toLowerCase())
  );

  const showAddOption =
    query.trim().length > 0 &&
    !options.some((o) => label(o).toLowerCase() === query.toLowerCase());

  const visibleItems = showAddOption
    ? [...filtered, "__add__" as const]
    : filtered;

  function selectItem(item: string) {
    if (item === "__add__") {
      onChange(query.trim());
      setQuery(query.trim());
    } else {
      onChange(item);
      setQuery(label(item));
    }
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, visibleItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < visibleItems.length) {
        selectItem(visibleItems[activeIndex] ?? "__add__");
      } else if (query.trim()) {
        onChange(query.trim());
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const activeItemId =
    activeIndex >= 0 ? `${id}-item-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={activeItemId}
        className={className}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
          // If text exactly matches an option, commit it; otherwise commit raw text
          const match = options.find(
            (o) => label(o).toLowerCase() === e.target.value.toLowerCase()
          );
          onChange(match ?? e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && visibleItems.length > 0 ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 200,
            top: "calc(100% + 3px)",
            left: 0,
            right: 0,
            background: "var(--gs-surface-elevated)",
            border: "1px solid var(--gs-border-strong)",
            borderRadius: "var(--gs-radius-sm)",
            boxShadow: "var(--gs-shadow-overlay)",
            maxHeight: 220,
            overflowY: "auto",
            margin: 0,
            padding: "0.25rem 0",
            listStyle: "none",
          }}
        >
          {visibleItems.map((item, idx) => {
            const isAdd = item === "__add__";
            return (
              <li
                key={isAdd ? "__add__" : item}
                id={`${id}-item-${idx}`}
                role="option"
                aria-selected={item === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(isAdd ? "__add__" : item);
                }}
                style={{
                  padding: "0.35rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                  background: idx === activeIndex ? "var(--gs-surface-hover)" : "transparent",
                  color: isAdd ? "var(--gs-accent)" : "var(--gs-text)",
                  fontStyle: isAdd ? "italic" : "normal",
                }}
              >
                {isAdd ? `Add: "${query.trim()}"` : label(item)}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
