import { useEffect, useRef, useState } from "react";
import { fastMode } from "../fast";
import { useGame } from "../store";
import type { BackdropHandle } from "./backdrop";

/** Dev mode: `?backdrop=force` draws the animated table even in software WebGL (screenshots of the interface tests). */
const forced = () => import.meta.env.DEV && new URLSearchParams(location.search).get("backdrop") === "force";

/**
 * Animated table behind the board (PLAN-V): only with the "full" graphics, without reduced motion nor the fast test mode,
 * and with a real GPU. Its code is a chunk of its own, loaded on demand; otherwise (or if WebGL fails) the still CSS
 * background of the texture shows.
 */
export function Backdrop({ theme }: { theme: string }) {
  const effects = useGame((s) => s.effects);
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<BackdropHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const eligible =
    effects === "full" && !failed && !fastMode() && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    import("./backdrop")
      .then(({ startBackdrop }) => {
        const canvas = ref.current;
        if (cancelled || !canvas) return;
        const h = startBackdrop(canvas, { force: forced(), onLost: () => setFailed(true) });
        if (!h) return setFailed(true);
        handle.current = h;
        if (canvas.parentElement) h.setPalette(canvas.parentElement);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      handle.current?.stop();
      handle.current = null;
    };
  }, [eligible]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new texture changes the palette
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (handle.current && parent) handle.current.setPalette(parent);
  }, [theme]);
  if (!eligible) return null;
  return <canvas ref={ref} className="board-backdrop" />;
}
