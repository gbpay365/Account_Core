import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';

interface ProtectedRouteProps {
  requiredResource: string;
  requiredAction: string;
  redirectTo?: string;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredResource,
  requiredAction,
  redirectTo = '/login',
  children,
}) => {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg-mesh)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
            Chargement des permissions...
          </p>
        </div>
      </div>
    );
  }

  if (!hasPermission(requiredResource, requiredAction)) {
    return <Navigate to={redirectTo} replace />;
  }

  // If children passed (layout mode), render children + let layout render <Outlet>
  // If no children (standalone guard), render <Outlet> for nested child routes
  return children ? <>{children}</> : <Outlet />;
};
