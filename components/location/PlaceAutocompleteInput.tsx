"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const GOOGLE_SCRIPT_ID = "google-maps-places-js";
const GOOGLE_MAPS_JS_BASE = "https://maps.googleapis.com/maps/api/js";
const INPUT_DEBOUNCE_MS = 260;
const MAX_RESULTS = 6;

interface PlaceSuggestion {
  placeId: string;
  description: string;
}

interface PlaceAutocompleteInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  onSelect?: (selection: { placeId: string; label: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  inputStyle?: CSSProperties;
  listStyle?: CSSProperties;
  ariaLabel?: string;
}

interface GoogleMapsApi {
  maps?: {
    places?: {
      PlacesServiceStatus?: {
        OK?: string;
      };
      AutocompleteService?: new () => {
        getPlacePredictions: (
          request: { input: string },
          callback: (
            predictions:
              | Array<{
                  description?: string;
                  place_id?: string;
                }>
              | null,
            status: string
          ) => void
        ) => void;
      };
    };
  };
}

type WindowWithGoogle = Window & {
  google?: GoogleMapsApi;
  __googlePlacesLoadPromise?: Promise<boolean>;
};

function getWindow(): WindowWithGoogle | null {
  if (typeof window === "undefined") return null;
  return window as WindowWithGoogle;
}

function getAutocompleteService() {
  const win = getWindow();
  const ctor = win?.google?.maps?.places?.AutocompleteService;
  if (!ctor) return null;
  return new ctor();
}

function loadGooglePlacesScript(apiKey: string): Promise<boolean> {
  const win = getWindow();
  if (!win || !apiKey) return Promise.resolve(false);
  if (win.google?.maps?.places?.AutocompleteService) return Promise.resolve(true);
  if (win.__googlePlacesLoadPromise) return win.__googlePlacesLoadPromise;

  win.__googlePlacesLoadPromise = new Promise<boolean>((resolve) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // If script tag already exists and Places is ready, resolve immediately.
      if (win.google?.maps?.places?.AutocompleteService) {
        resolve(true);
        return;
      }
      // If script already finished loading but Places isn't available, fail fast.
      if (existing.getAttribute("data-gs-loaded") === "1") {
        resolve(false);
        return;
      }
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `${GOOGLE_MAPS_JS_BASE}?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.addEventListener(
      "load",
      () => {
        script.setAttribute("data-gs-loaded", "1");
        resolve(true);
      },
      { once: true }
    );
    script.addEventListener("error", () => resolve(false), { once: true });
    document.head.appendChild(script);
  }).finally(() => {
    const latest = getWindow();
    if (latest) latest.__googlePlacesLoadPromise = undefined;
  });

  return win.__googlePlacesLoadPromise;
}

export default function PlaceAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  inputStyle,
  listStyle,
  ariaLabel,
}: PlaceAutocompleteInputProps) {
  const listId = useId();
  const requestTimerRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, PlaceSuggestion[]>>(new Map());
  const blurTimerRef = useRef<number | null>(null);
  const hasUserEditedRef = useRef(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  const hasResults = suggestions.length > 0;
  const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : null;

  useEffect(() => {
    return () => {
      if (requestTimerRef.current != null) window.clearTimeout(requestTimerRef.current);
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const loaded = await loadGooglePlacesScript(
        process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? ""
      );
      if (cancelled) return;
      if (!loaded || !getAutocompleteService()) {
        setIsReady(false);
        setStatusText("Autocomplete unavailable, you can still type manually.");
        return;
      }
      setIsReady(true);
      setStatusText("");
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady || disabled) return;
    if (!hasUserEditedRef.current) return;
    const query = value.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      if (query.length === 0) setStatusText("");
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setIsOpen(true);
      setActiveIndex(-1);
      setStatusText(cached.length ? "" : "No places found.");
      return;
    }

    if (requestTimerRef.current != null) window.clearTimeout(requestTimerRef.current);
    requestTimerRef.current = window.setTimeout(() => {
      const service = getAutocompleteService();
      if (!service) {
        setStatusText("Autocomplete unavailable, you can still type manually.");
        return;
      }
      service.getPlacePredictions({ input: query }, (predictions, status) => {
        const okStatus = getWindow()?.google?.maps?.places?.PlacesServiceStatus?.OK ?? "OK";
        if (status !== okStatus || !predictions) {
          cacheRef.current.set(cacheKey, []);
          setSuggestions([]);
          setActiveIndex(-1);
          setIsOpen(true);
          setStatusText("No places found.");
          return;
        }
        const next: PlaceSuggestion[] = predictions
          .map((prediction) => ({
            placeId: prediction.place_id ?? "",
            description: prediction.description ?? "",
          }))
          .filter((entry) => entry.placeId && entry.description)
          .slice(0, MAX_RESULTS);
        cacheRef.current.set(cacheKey, next);
        setSuggestions(next);
        setActiveIndex(-1);
        setIsOpen(true);
        setStatusText(next.length > 0 ? "" : "No places found.");
      });
    }, INPUT_DEBOUNCE_MS);
  }, [value, isReady, disabled]);

  function closeListSoon() {
    if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 100);
  }

  function openListNow() {
    if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    if (suggestions.length > 0) setIsOpen(true);
  }

  function commitSelection(selection: PlaceSuggestion) {
    onChange(selection.description);
    onSelect?.({ placeId: selection.placeId, label: selection.description });
    hasUserEditedRef.current = false;
    setIsOpen(false);
    setActiveIndex(-1);
  }

  const ariaActiveDescendant = useMemo(() => {
    if (!activeSuggestion) return undefined;
    return `${listId}-${activeSuggestion.placeId}`;
  }, [activeSuggestion, listId]);

  return (
    <div data-place-autocomplete="true" style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(event) => {
          hasUserEditedRef.current = true;
          onChange(event.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={openListNow}
        onBlur={closeListSoon}
        onKeyDown={(event) => {
          if (!hasResults) {
            if (event.key === "Escape") setIsOpen(false);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => (current + 1) % suggestions.length);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) =>
              current <= 0 ? suggestions.length - 1 : current - 1
            );
            return;
          }
          if (event.key === "Enter") {
            if (activeSuggestion) {
              event.preventDefault();
              commitSelection(activeSuggestion);
            }
            return;
          }
          if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={ariaActiveDescendant}
        aria-autocomplete="list"
        style={inputStyle}
      />
      {isOpen && hasResults ? (
        <ul
          data-place-autocomplete="true"
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 50,
            listStyle: "none",
            margin: 0,
            padding: "0.2rem 0",
            background: "#fff",
            border: "1px solid #ccc",
            maxHeight: "12rem",
            overflowY: "auto",
            ...listStyle,
          }}
        >
          {suggestions.map((suggestion, idx) => (
            <li
              key={suggestion.placeId}
              id={`${listId}-${suggestion.placeId}`}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                commitSelection(suggestion);
              }}
              style={{
                padding: "0.35rem 0.45rem",
                fontSize: "0.8rem",
                cursor: "pointer",
                background: idx === activeIndex ? "#f0ede6" : "#fff",
              }}
            >
              {suggestion.description}
            </li>
          ))}
        </ul>
      ) : null}
      {statusText ? (
        <p
          style={{
            margin: "0.28rem 0 0",
            fontSize: "0.62rem",
            lineHeight: 1.35,
            color: "#7a7368",
          }}
        >
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
