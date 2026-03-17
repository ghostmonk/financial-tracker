import { useState, useEffect } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { useDatabase } from "../contexts/DatabaseContext";
import { countUncategorizedGroups } from "../lib/tauri";

interface NavItem {
  to: string;
  label: string;
  showBadge?: boolean;
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/categorize", label: "Categorize", showBadge: true },
  { to: "/import", label: "Import" },
  { to: "/accounts", label: "Accounts" },
  { to: "/categories", label: "Categories" },
  { to: "/rules", label: "Rules" },
  { to: "/tax", label: "Tax" },
];

export default function Layout() {
  const { isUnlocked } = useDatabase();
  const navigate = useNavigate();
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [sidebarIndex, setSidebarIndex] = useState(0);

  useEffect(() => {
    if (!isUnlocked) return;
    const fetchCount = () => {
      countUncategorizedGroups().then(setUncategorizedCount).catch(console.error);
    };
    fetchCount();
    window.addEventListener("categorization-changed", fetchCount);
    return () => window.removeEventListener("categorization-changed", fetchCount);
  }, [isUnlocked]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "h") {
        e.preventDefault();
        setSidebarFocused((prev) => {
          const next = !prev;
          window.dispatchEvent(
            new CustomEvent("sidebar-focus-changed", { detail: next }),
          );
          return next;
        });
        return;
      }
      if (!sidebarFocused) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSidebarIndex((prev) => Math.min(prev + 1, navItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSidebarIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          navigate(navItems[sidebarIndex].to);
          setSidebarFocused(false);
          window.dispatchEvent(
            new CustomEvent("sidebar-focus-changed", { detail: false }),
          );
          break;
        case "Escape":
          e.preventDefault();
          setSidebarFocused(false);
          window.dispatchEvent(
            new CustomEvent("sidebar-focus-changed", { detail: false }),
          );
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarFocused, sidebarIndex, navigate]);

  if (!isUnlocked) {
    return <Navigate to="/unlock" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <aside data-testid="sidebar" className="w-56 flex-shrink-0 bg-gray-900 dark:bg-gray-950 text-gray-300 flex flex-col">
        <div className="px-5 py-6 text-lg font-semibold text-white tracking-tight">
          Financial Tracker
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, showBadge }, index) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${to.replace("/", "")}`}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                } ${sidebarFocused && index === sidebarIndex ? "ring-2 ring-blue-500" : ""}`
              }
            >
              {label}
              {showBadge && uncategorizedCount > 0 && (
                <span data-testid="nav-categorize-badge" className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {uncategorizedCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
