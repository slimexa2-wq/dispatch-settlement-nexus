import { Spin } from "antd";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForPermissions } from "./home";
import { AppLayout } from "../layout/AppLayout";
import { LoginPage } from "../pages/LoginPage";
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const PeoplePage = lazy(() => import("../pages/PeoplePage").then((module) => ({ default: module.PeoplePage })));
const ProjectsPage = lazy(() => import("../pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const SuppliersPage = lazy(() => import("../pages/SuppliersPage").then((module) => ({ default: module.SuppliersPage })));
const PoliciesPage = lazy(() => import("../pages/PoliciesPage").then((module) => ({ default: module.PoliciesPage })));
const JobDemandsPage = lazy(() => import("../pages/JobDemandsPage").then((module) => ({ default: module.JobDemandsPage })));
const RecruitmentProgressPage = lazy(() => import("../pages/RecruitmentProgressPage").then((module) => ({ default: module.RecruitmentProgressPage })));
const ReferralRewardsPage = lazy(() => import("../pages/ReferralRewardsPage").then((module) => ({ default: module.ReferralRewardsPage })));
const SalarySlipsPage = lazy(() => import("../pages/SalarySlipsPage").then((module) => ({ default: module.SalarySlipsPage })));
const ElectronicContractsPage = lazy(() => import("../pages/ElectronicContractsPage").then((module) => ({ default: module.ElectronicContractsPage })));
const ImportsPage = lazy(() => import("../pages/ImportsPage").then((module) => ({ default: module.ImportsPage })));
const SettingsPage = lazy(() => import("../pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const MiniappDemoPage = lazy(() => import("../pages/MiniappDemoPage").then((module) => ({ default: module.MiniappDemoPage })));
const ProductIntroPage = lazy(() => import("../pages/ProductIntroPage").then((module) => ({ default: module.ProductIntroPage })));
const AiAssistantPage = lazy(() => import("../pages/AiAssistantPage").then((module) => ({ default: module.AiAssistantPage })));
const InternalEmployeesPage = lazy(() => import("../pages/InternalEmployeesPage").then((module) => ({ default: module.InternalEmployeesPage })));
const ReimbursementsPage = lazy(() => import("../pages/ReimbursementsPage").then((module) => ({ default: module.ReimbursementsPage })));
const LeadershipDashboardPage = lazy(() => import("../pages/LeadershipDashboardPage").then((module) => ({ default: module.LeadershipDashboardPage })));

function ProtectedLayout() {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <div className="full-screen-loader"><Spin size="large" description="正在验证登录状态" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppLayout />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathForPermissions(user?.permissions ?? [])} replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="route-loader"><Spin size="large" /></div>}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/product" element={<ProductIntroPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/internal-employees" element={<InternalEmployeesPage />} />
        <Route path="/reimbursements" element={<ReimbursementsPage />} />
        <Route path="/leadership" element={<LeadershipDashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/policies/supplier" element={<PoliciesPage type="SUPPLIER" />} />
        <Route path="/policies/referral" element={<PoliciesPage type="EMPLOYEE_REFERRAL" />} />
        <Route path="/recruitment/demands" element={<JobDemandsPage />} />
        <Route path="/recruitment/progress" element={<RecruitmentProgressPage />} />
        <Route path="/recruitment/rewards" element={<ReferralRewardsPage />} />
        <Route path="/salary-slips" element={<SalarySlipsPage />} />
        <Route path="/electronic-contracts" element={<ElectronicContractsPage />} />
        <Route path="/statistics" element={<Navigate to="/dashboard" replace />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/miniapp-demo" element={<MiniappDemoPage />} />
        <Route path="/ai-assistant" element={<AiAssistantPage />} />
        <Route index element={<HomeRedirect />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes></Suspense>
  );
}
