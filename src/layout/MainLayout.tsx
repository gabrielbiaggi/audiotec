/**
 * MainLayout — Sonic Lab Pro 4-zone shell.
 *
 * ┌────────────────────────────────────────────────────┐
 * │  Header (h-8)                                      │
 * ├──────────┬────────────────────────────┬────────────┤
 * │          │  Viewport (flex-1)         │  [Tools]   │
 * │ Sidebar  │  · Magnitude (65%)         │  Drawer    │
 * │ (w-52)   │  · Phase     (35%) (TF)    │  (w-72)    │
 * │          │                            │            │
 * ├──────────┴────────────────────────────┴────────────┤
 * │  ControlBar (h-14)                                 │
 * └────────────────────────────────────────────────────┘
 */

interface MainLayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  viewport: React.ReactNode;
  controls: React.ReactNode;
  toolsDrawer?: React.ReactNode;
}

export default function MainLayout({ header, sidebar, viewport, controls, toolsDrawer }: MainLayoutProps) {
  return (
    <div className="flex flex-col w-full h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Top header bar */}
      {header}

      {/* Middle: sidebar + viewport + optional tools drawer */}
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 min-w-0 min-h-0">
          {viewport}
        </div>
        {toolsDrawer}
      </div>

      {/* Footer control bar */}
      {controls}
    </div>
  );
}
