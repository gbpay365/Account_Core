import { useContext } from 'react';
import { PermissionContext } from '../contexts/PermissionContext';

export const usePermissions = () => useContext(PermissionContext);
