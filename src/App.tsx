import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import Layout from "./components/Layout";
import UnlockPage from "./pages/UnlockPage";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import ImportPage from "./pages/ImportPage";
import AccountsPage from "./pages/AccountsPage";
import CategoriesPage from "./pages/CategoriesPage";
import CategorizePage from "./pages/CategorizePage";
import RulesPage from "./pages/RulesPage";
import TaxPage from "./pages/TaxPage";

export default function App() {
  return (
    <DatabaseProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/unlock" element={<UnlockPage />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/transactions" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="categorize" element={<CategorizePage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="tax" element={<TaxPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DatabaseProvider>
  );
}
