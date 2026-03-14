import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useDatabase } from "../contexts/DatabaseContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/import", label: "Import" },
  { to: "/accounts", label: "Accounts" },
  { to: "/categories", label: "Categories" },
];

export default function Layout() {
  const { isUnlocked } = useDatabase();

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
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {label}
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
