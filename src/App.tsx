import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { AnimeDetailsPage } from './pages/AnimeDetailsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SearchPage } from './pages/SearchPage';
import { WatchPage } from './pages/WatchPage';

export function AppRoutes() {
  return (
    <>
      <Header />
      <main id="main-content" className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/anime/:id" element={<AnimeDetailsPage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
