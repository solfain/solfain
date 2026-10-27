import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { AnimeDetailsPage } from './pages/AnimeDetailsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SchedulePage } from './pages/SchedulePage';
import { SearchPage } from './pages/SearchPage';
import { WatchPage } from './pages/WatchPage';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export function AppRoutes() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <ScrollToTop />
      <Header />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/anime/:id" element={<AnimeDetailsPage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
