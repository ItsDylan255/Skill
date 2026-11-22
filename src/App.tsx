import { useEffect, useMemo, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { HobbyContext } from "./components/HobbyContext";
import { Layout } from "./components/Layout";
import { ConfirmHost, ToastHost } from "./components/ui";
import { Derived } from "./domain/derived";
import { useHobbies, useHobbyData } from "./lib/store";
import { DashboardPage } from "./pages/DashboardPage";
import { ExerciseDialog } from "./components/ExerciseDialog";
import { closeHobbyDialogs } from "./lib/uiState";
import { RoutineDialog } from "./components/RoutineDialog";
import { TopicDialog } from "./components/TopicDialog";
import { ItemDialog } from "./components/ItemDialog";
import { CommandPaletteHost } from "./components/CommandPalette";
import { ListPage } from "./pages/ListPage";
import { SongsPage } from "./pages/SongsPage";
import { ExercisesPage } from "./pages/ExercisesPage";
import { GoalsPage } from "./pages/GoalsPage";
import { PlanBasePage, PlanPage } from "./pages/PlanPage";
import { PhasesPage } from "./pages/PhasesPage";
import { PracticePage } from "./pages/PracticePage";
import { RoutinesPage } from "./pages/RoutinesPage";
import { WelcomePage } from "./pages/WelcomePage";

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/h/:hobbyId/*" element={<HobbyShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ConfirmHost />
      <ToastHost />
    </HashRouter>
  );
}

function Home() {
  const { data: hobbies, loading, error } = useHobbies();
  if (error) return <Center>Datenbank-Fehler: {error}</Center>;
  if (loading) return null;
  if (hobbies && hobbies.length > 0) return <Navigate to={`/h/${hobbies[0].id}`} replace />;
  return <WelcomePage />;
}

function HobbyShell() {
  const hobbyId = Number(useParams().hobbyId);
  const { data, loading, error } = useHobbyData(hobbyId);
  const ctx = useMemo(
    () => (data ? { data, d: new Derived(data), base: `/h/${hobbyId}` } : null),
    [data, hobbyId],
  );
  useEffect(() => closeHobbyDialogs, [hobbyId]);
  const color = data?.hobby.color;
  useEffect(() => {
    if (!color) return;
    document.documentElement.style.setProperty("--accent", color);
    return () => void document.documentElement.style.removeProperty("--accent");
  }, [color]);

  if (error) return <Center>Fehler beim Laden: {error}</Center>;
  if (loading) return null;
  if (!ctx) return <Navigate to="/" replace />;

  return (
    <HobbyContext.Provider value={ctx}>
      <div className="flex h-full flex-col">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="exercises" element={<ExercisesPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="plan/:baseId" element={<PlanBasePage />} />
          <Route path="songs" element={<SongsPage />} />
          <Route path="list" element={<ListPage />} />
          <Route path="routines" element={<RoutinesPage />} />
          <Route path="practice/:kind/:id" element={<PracticePage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="phases" element={<PhasesPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
      <ExerciseDialog />
      <RoutineDialog />
      <TopicDialog />
      <ItemDialog />
      <CommandPaletteHost />
    </HobbyContext.Provider>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted">{children}</div>;
}
