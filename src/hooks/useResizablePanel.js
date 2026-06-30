import { useState, useCallback } from 'react';

export function useResizablePanel(key, defaultWidth = 300, min = 180, max = 560) {
  const [width, setWidth] = useState(() => {
    const s = localStorage.getItem(key);
    const n = s ? parseInt(s, 10) : defaultWidth;
    return Math.max(min, Math.min(max, n));
  });
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(key + '_c') === '1');
  const [dragging, setDragging] = useState(false);

  const startResize = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    const x0 = e.clientX;
    const w0 = width;

    function onMove(e) {
      setWidth(Math.max(min, Math.min(max, w0 + e.clientX - x0)));
    }
    function onUp(e) {
      const final = Math.max(min, Math.min(max, w0 + e.clientX - x0));
      setDragging(false);
      localStorage.setItem(key, String(final));
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, key, min, max]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(key + '_c', next ? '1' : '0');
  }

  return { width, collapsed, dragging, toggle, startResize };
}
