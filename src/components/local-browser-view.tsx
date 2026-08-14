"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live view of the local chromium, painted from CDP screencast frames.
 *
 * Replaces the onkernel `browser_live_view_url` iframe. CDP is a websocket
 * protocol rather than a viewable page, so there is nothing to frame — the
 * server streams JPEG frames over SSE and we paint them, forwarding clicks and
 * keystrokes back as Input.dispatch* events.
 */
export function LocalBrowserView({ browserId }: { browserId: string }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  // Frame metadata gives the page's own viewport size, which is what CDP input
  // coordinates are relative to. The rendered element is a different size, so
  // clicks have to be scaled or they land in the wrong place.
  const viewport = useRef({ width: 1280, height: 800 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/browser/screencast?browserId=${encodeURIComponent(browserId)}`);

    source.addEventListener("ready", () => setStatus("live"));
    source.addEventListener("frame", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        data: string;
        metadata?: { deviceWidth?: number; deviceHeight?: number };
      };
      if (payload.metadata?.deviceWidth && payload.metadata?.deviceHeight) {
        viewport.current = {
          width: payload.metadata.deviceWidth,
          height: payload.metadata.deviceHeight,
        };
      }
      setFrame(`data:image/jpeg;base64,${payload.data}`);
      setStatus("live");
    });
    source.addEventListener("error", (event) => {
      const data = (event as MessageEvent).data;
      if (data) {
        try {
          setError(JSON.parse(data).message);
        } catch {
          setError("screencast stream failed");
        }
      }
      setStatus("error");
    });

    return () => source.close();
  }, [browserId]);

  const toPageCoords = useCallback((clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * viewport.current.width),
      y: Math.round(((clientY - rect.top) / rect.height) * viewport.current.height),
    };
  }, []);

  const dispatch = useCallback(
    (type: "mouse" | "key", event: Record<string, unknown>) => {
      void fetch("/api/browser/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId, type, event }),
      });
    },
    [browserId]
  );

  const onMouse = useCallback(
    (cdpType: "mousePressed" | "mouseReleased" | "mouseMoved") =>
      (e: React.MouseEvent) => {
        const { x, y } = toPageCoords(e.clientX, e.clientY);
        dispatch("mouse", {
          type: cdpType,
          x,
          y,
          button: cdpType === "mouseMoved" ? "none" : "left",
          clickCount: cdpType === "mouseMoved" ? 0 : 1,
        });
      },
    [dispatch, toPageCoords]
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      // keyDown alone does not produce text; chromium needs a char event for
      // printable keys, and rawKeyDown for the rest.
      const printable = e.key.length === 1;
      dispatch("key", {
        type: printable ? "char" : "rawKeyDown",
        text: printable ? e.key : undefined,
        key: e.key,
        windowsVirtualKeyCode: e.keyCode,
        nativeVirtualKeyCode: e.keyCode,
      });
    },
    [dispatch]
  );

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
        <h2 className="text-lg font-medium mb-2">Browser unavailable</h2>
        <p className="text-sm max-w-md">{error ?? "The local browser is not responding."}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={frame}
          alt="Local browser"
          tabIndex={0}
          onMouseDown={onMouse("mousePressed")}
          onMouseUp={onMouse("mouseReleased")}
          onMouseMove={onMouse("mouseMoved")}
          onKeyDown={onKey}
          className="max-w-full max-h-full object-contain outline-none cursor-default"
          draggable={false}
        />
      ) : (
        <div className="text-gray-400 text-sm">Starting local browser…</div>
      )}
    </div>
  );
}
