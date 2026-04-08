/**
 * MainLayout — Sonic Lab Pro 4-zone shell with collapsible panels.
 *
 * ┌────────────────────────────────────────────────────┐
 * │  Header (h-8)                                      │
 * ├──────────┬────────────────────────────┬────────────┤
 * │          │  Viewport (flex-1)         │  [Tools]   │
 * │ Sidebar  │  · Magnitude (resizable)   │  Drawer    │
 * │ collapse │  · Phase     (resizable)   │  collapse  │
 * │          │                            │            │
 * ├──────────┴────────────────────────────┴────────────┤
 * │  ControlBar (h-14)                                 │
 * └────────────────────────────────────────────────────┘
 */

interface MainLayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  viewport: React.ReactNode;
  controls: React.ReactNode;
  toolsDrawer?: React.ReactNode;
  toolsOpen: boolean;
  academyPanel?: React.ReactNode;
  overlay?: React.ReactNode;
}

export default function MainLayout({
  header,
  sidebar,
  sidebarOpen,
  viewport,
  controls,
  toolsDrawer,
  toolsOpen,
  academyPanel,
  overlay,
}: MainLayoutProps) {
  return (
    <div className="flex flex-col w-full h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Top header bar */}
      {header}

      {/* Middle: sidebar + viewport + optional tools drawer + academy */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Collapsible sidebar */}
        <div className={`panel-collapsible ${sidebarOpen ? "" : "collapsed"}`} style={sidebarOpen ? { width: "13rem" } : undefined}>
          {sidebar}
        </div>

        {/* Main viewport */}
        <div className="flex-1 min-w-0 min-h-0">
          {viewport}
        </div>

        {/* Collapsible tools drawer */}
        <div className={`panel-collapsible ${toolsOpen ? "" : "collapsed"}`} style={toolsOpen ? { width: "18rem" } : undefined}>
          {toolsDrawer}
        </div>

        {/* Academy panel (when visible) */}
        {academyPanel}
      </div>

      {/* Footer control bar */}
      {controls}

      {/* Full-screen overlays (wizard, onboarding) */}
      {overlay}
    </div>
  );
}
