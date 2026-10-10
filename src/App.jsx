import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminContact from '@/pages/AdminContact';
import AdminGuestPosts from '@/pages/AdminGuestPosts';
import AdminAuthors from '@/pages/AdminAuthors';

// The rich-text editor is heavy; load it only when an article is opened.
const ArticleEditor = lazy(() => import('@/pages/ArticleEditor'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route path="/" element={<AdminDashboard />} />
              <Route path="/articles/new" element={<Suspense fallback={null}><ArticleEditor /></Suspense>} />
              <Route path="/articles/:id/edit" element={<Suspense fallback={null}><ArticleEditor /></Suspense>} />
              <Route path="/contact" element={<AdminContact />} />
              <Route path="/guest-posts" element={<AdminGuestPosts />} />
              <Route path="/authors" element={<AdminAuthors />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
