import React, { createContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

interface PermissionContextType {
  permissions: string[];
  hasPermission: (resource: string, action: string) => boolean;
  loading: boolean;
}

export const PermissionContext = createContext<PermissionContextType>({
  permissions: [],
  hasPermission: () => false,
  loading: true,
});

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!authService.isAuthenticated()) {
        setPermissions([]);
        setLoading(false);
        return;
      }
      try {
        const perms = await authService.getCurrentUserPermissions();
        setPermissions(perms);
      } catch (error) {
        console.error("Failed to load permissions", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPermissions();
  }, []);

  const hasPermission = (resource: string, action: string): boolean => {
    return permissions.includes(`${resource}:${action}`);
  };

  return (
    <PermissionContext.Provider value={{ permissions, hasPermission, loading }}>
      {children}
    </PermissionContext.Provider>
  );
};
