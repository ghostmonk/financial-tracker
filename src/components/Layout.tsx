import { useState, useEffect } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
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
];

export default function Layout() {
  const { isUnlocked } = useDatabase();
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  useEffect(() => {
    if (!isUnlocked) return;
    countUncategorizedGroups()
      .then(setUncategorizedCount)
      .catch(console.error);
  }, [isUnlocked]);

  if (!isUnlocked) {
    return <Navigate to="/unlock" replace />;
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <aside className="w-56 flex-shrink-0 bg-gray-900 dark:bg-gray-950 text-gray-300 flex flex-col">
        <div className="px-5 py-6 text-lg font-semibold text-white tracking-tight">
          Financial Tracker
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, showBadge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {label}
              {showBadge && uncategorizedCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
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
