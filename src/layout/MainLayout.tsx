/**
 * MainLayout — Three-panel application shell.
 *
 * ┌─────────────┬────────────────────────────────────┐
 * │             │                                    │
 * │   DataBar   │          Graph Area                │
 * │  (sidebar)  │          (canvas)                  │
 * │             │                                    │
 * │             ├────────────────────────────────────┤
 * │             │          Control Bar               │
 * └─────────────┴────────────────────────────────────┘
 */

interface MainLayoutProps {
  sidebar: React.ReactNode;
  graph: React.ReactNode;
  controls: React.ReactNode;
}

export default function MainLayout({ sidebar, graph, controls }: MainLayoutProps) {
  return (
    <div className="flex w-full h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Left sidebar */}
      {sidebar}

      {/* Right area: graph (flex-1) + controls (bottom) */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Graph takes all available space */}
        <div className="flex-1 min-h-0">
          {graph}
        </div>
        {/* Control bar at bottom */}
        {controls}
      </div>
    </div>
  );
}
