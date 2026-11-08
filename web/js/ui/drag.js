// A finger dragged across a list, turned into steps: one row up or down, one half hour left or right.
// The menu and the guide move a highlight rather than scroll (that's how a TV remote works them), so on a
// touch screen a drag steps the highlight along under the finger, which reads as scrolling.
//
// The lists redraw as the highlight moves, which takes away the row the finger is on. A touch's events
// keep going to the element it started on even after that leaves the page, so the moves are heard on
// that element itself rather than on the list.
//
// opts: { stepY() px per row, stepX() px per column (0/absent: vertical only), onStep(dir) with dir
// "up" | "down" | "left" | "right" }. Returns { dragged() }: true just after a drag, so the tap that ends
// it isn't taken as a press.

export function dragSteps(el, opts) {
  let lastDrag = 0;
  el.addEventListener(
    "touchstart",
    function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      const t0 = e.touches[0];
      const target = e.target;
      const s = { x: t0.clientX, y: t0.clientY, axis: "", moved: false };
      const move = function (ev) {
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (!s.axis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          s.axis = Math.abs(dy) >= Math.abs(dx) || !opts.stepX ? "y" : "x";
        }
        const step = s.axis === "y" ? opts.stepY() : opts.stepX();
        if (step > 0) {
          let d = s.axis === "y" ? dy : dx;
          for (let guard = 0; Math.abs(d) >= step && guard < 40; guard++) {
            const back = d < 0;
            // Finger up: the list follows it up, showing what's below.
            opts.onStep(s.axis === "y" ? (back ? "down" : "up") : back ? "right" : "left");
            if (s.axis === "y") s.y += back ? -step : step;
            else s.x += back ? -step : step;
            d = s.axis === "y" ? t.clientY - s.y : t.clientX - s.x;
            s.moved = true;
          }
        }
        // While dragging a list, the page itself stays put.
        if (ev.cancelable) ev.preventDefault();
      };
      const end = function () {
        if (s.moved) lastDrag = Date.now();
        target.removeEventListener("touchmove", move);
        target.removeEventListener("touchend", end);
        target.removeEventListener("touchcancel", end);
      };
      target.addEventListener("touchmove", move, { passive: false });
      target.addEventListener("touchend", end);
      target.addEventListener("touchcancel", end);
    },
    { passive: true }
  );
  return {
    dragged: function () {
      return Date.now() - lastDrag < 450;
    },
  };
}
