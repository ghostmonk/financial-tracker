import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { unlockDatabase, isDatabaseInitialized } from "../lib/tauri";
import { useDatabase } from "../contexts/DatabaseContext";

export default function UnlockPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { setUnlocked } = useDatabase();

  useEffect(() => {
    isDatabaseInitialized()
      .then((initialized) => setIsFirstLaunch(!initialized))
      .catch(() => setIsFirstLaunch(true));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password) return;

    setError(null);
    setLoading(true);
    try {
      await unlockDatabase(password);
      setUnlocked(true);
      navigate("/transactions", { replace: true });
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to unlock database");
    } finally {
      setLoading(false);
    }
  }

  const heading =
    isFirstLaunch === null
      ? "Financial Tracker"
      : isFirstLaunch
        ? "Create Password"
        : "Enter Password";

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1 text-center">
          Financial Tracker
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
          {heading}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isFirstLaunch ? "Choose a password" : "Enter password"}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
