/**
 * MainLayout — Pro Audio Desktop shell with Activity Bar.
 *
 * ┌──┬────────────────────────────────────────────────┐
 * │  │  Header                                        │
 * │  ├──────────┬────────────────────────┬────────────┤
 * │AB│ Sidebar  │  Viewport (flex-1)     │  [Tools]   │
 * │  │ (data)   │  · Canvas              │  Drawer    │
 * │  │          │  · Split views         │  (one tool)│
 * │  ├──────────┴────────────────────────┴────────────┤
 * │  │  ControlDesk (transport + VU + delay)          │
 * └──┴────────────────────────────────────────────────┘
 *
 * The Activity Bar is a fixed 44px icon rail (like VS Code) that lets the
 * user switch which panel is visible in the sidebar/tools area. Only ONE
 * tool drawer is open at a time. The sidebar (DataBar) toggles independently.
 */

export type ActivityItem = {
  id: string;
  icon: string;
  label: string;
  position?: "top" | "bottom";
};

interface MainLayoutProps {
  /** Activity Bar icon definitions */
  activityItems: ActivityItem[];
  /** Currently active activity item ID (for tools drawer) */
  activeActivity: string | null;
  /** Callback when an activity icon is clicked */
  onActivityChange: (id: string | null) => void;

  header: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  viewport: React.ReactNode;
  controls: React.ReactNode;
  toolsDrawer?: React.ReactNode;
  academyPanel?: React.ReactNode;
  overlay?: React.ReactNode;
}

export default function MainLayout({
  activityItems,
  activeActivity,
  onActivityChange,
  header,
  sidebar,
  sidebarOpen,
  viewport,
  controls,
  toolsDrawer,
  academyPanel,
  overlay,
}: MainLayoutProps) {
  const topItems = activityItems.filter((i) => i.position !== "bottom");
  const bottomItems = activityItems.filter((i) => i.position === "bottom");

  return (
    <div className="flex w-full h-screen bg-[#0A0A0A] text-zinc-200 overflow-hidden">
      {/* ── Activity Bar (fixed icon rail) ── */}
      <div className="flex flex-col items-center w-11 shrink-0 bg-[#0F0F0F] border-r border-zinc-800/50 py-1 select-none">
        <div className="flex flex-col items-center gap-0.5 flex-1">
          {topItems.map((item) => (
            <ActivityIcon
              key={item.id}
              item={item}
              active={activeActivity === item.id}
              onClick={() => onActivityChange(activeActivity === item.id ? null : item.id)}
            />
          ))}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          {bottomItems.map((item) => (
            <ActivityIcon
              key={item.id}
              item={item}
              active={activeActivity === item.id}
              onClick={() => onActivityChange(activeActivity === item.id ? null : item.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header bar */}
        {header}

        {/* Middle: sidebar + viewport + tools drawer */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Collapsible sidebar (DataBar) */}
          <div
            className="shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out"
            style={{ width: sidebarOpen ? "13rem" : 0, opacity: sidebarOpen ? 1 : 0 }}
          >
            {sidebar}
          </div>

          {/* Main viewport (canvas) */}
          <div className="flex-1 min-w-0 min-h-0">
            {viewport}
          </div>

          {/* Collapsible tools drawer (one tool at a time) */}
          {(toolsDrawer || academyPanel) && (
            <div
              className="shrink-0 overflow-hidden border-l border-zinc-800/50 transition-[width,opacity] duration-200 ease-out"
              style={{ width: "18rem", opacity: 1 }}
            >
              {toolsDrawer}
              {academyPanel}
            </div>
          )}
        </div>

        {/* Footer control desk */}
        {controls}
      </div>

      {/* Full-screen overlays */}
      {overlay}
    </div>
  );
}

// ─── Activity Bar Icon ──────────────────────────────────────────────

function ActivityIcon({
  item,
  active,
  onClick,
}: {
  item: ActivityItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      className={`
        relative w-10 h-10 flex items-center justify-center rounded-md
        transition-colors duration-100
        ${active
          ? "text-[#00e5ff]"
          : "text-zinc-600 hover:text-zinc-400"
        }
      `}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-[#00e5ff]" />
      )}
      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
    </button>
  );
}
