import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authAccessApi } from '../api';
import { ModalPortal } from '../components/ModalPortal';
import { JemShellModal } from '../components/jem/JemShellModal';
import '../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../lib/companyContext';
import { showToast } from '../utils/dialogs';

interface PermissionItem {
  id: string;
  resource: string;
  action: string;
  key: string;
}

const AccessManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [invite, setInvite] = useState({ fullName: '', email: '', roleId: '' });
  const [securityRolesOpen, setSecurityRolesOpen] = useState(true);
  const [companyId, setCompanyId] = useState(() => getStoredCompanyId());
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [savingPerms, setSavingPerms] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!companyId) {
      setUsers([]);
      setRoles([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [uRes, rRes, cRes] = await Promise.all([
        authAccessApi.getUsers(companyId),
        authAccessApi.getRoles(companyId),
        authAccessApi.getPermissionCatalog(),
      ]);
      setUsers(Array.isArray(uRes.data) ? uRes.data : []);
      setRoles(Array.isArray(rRes.data) ? rRes.data : []);
      setCatalog(Array.isArray(cRes.data) ? cRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const onCompany = () => setCompanyId(getStoredCompanyId());
    window.addEventListener('companyChange', onCompany);
    window.addEventListener('storage', onCompany);
    return () => {
      window.removeEventListener('companyChange', onCompany);
      window.removeEventListener('storage', onCompany);
    };
  }, []);

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, PermissionItem[]> = {};
    catalog.forEach(p => {
      if (!groups[p.resource]) groups[p.resource] = [];
      groups[p.resource].push(p);
    });
    return groups;
  }, [catalog]);

  const selectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    const role = roles.find(r => r.id === roleId);
    const ids = new Set<string>(
      (role?.rolePermissions || [])
        .map((rp: any) => String(rp.permissionId || ''))
        .filter(Boolean)
    );
    setSelectedPermIds(ids);
  };

  const togglePermission = (permId: string) => {
    setSelectedPermIds(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const saveRolePermissions = async () => {
    if (!selectedRoleId) return;
    try {
      setSavingPerms(true);
      await authAccessApi.updateRolePermissions(selectedRoleId, Array.from(selectedPermIds));
      showToast('Permissions saved.', 'success');
      await loadData();
    } catch (err: any) {
      showToast('Error: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleUserRoleChange = async (userId: string, roleId: string) => {
    if (!companyId) return;
    try {
      await authAccessApi.updateUserRole(userId, roleId, companyId);
      showToast('User role updated.', 'success');
      setEditingUserId(null);
      loadData();
    } catch (err: any) {
      showToast('Error: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      await authAccessApi.createRole(newRoleName.trim());
      setNewRoleName('');
      setShowRoleModal(false);
      await loadData();
    } catch (err: any) {
      const d = err.response?.data;
      showToast('Error: ' + (d?.error || d?.title || err.message), 'error');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite.roleId) {
      showToast('Select a role, or create one first.', 'error');
      return;
    }
    try {
      const res = await authAccessApi.createUser({
        fullName: invite.fullName.trim(),
        email: invite.email.trim(),
        roleId: invite.roleId,
        companyId
      });
      setShowInviteModal(false);
      setInvite({ fullName: '', email: '', roleId: roles[0]?.id || '' });
      if (res.data?.temporaryPassword) {
        alert(`User created. Share this temporary password once: ${res.data.temporaryPassword}`);
      } else {
        showToast('User created.', 'success');
      }
      loadData();
    } catch (err: any) {
      const d = err.response?.data;
      showToast('Error: ' + (d?.error || d?.title || err.message), 'error');
    }
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);

  return (
    <div className="animate-fade-in" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🔑 Access Management</h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>Manage users, roles, and granular permissions</p>
        </div>
        <button type="button" className="btn-glow" onClick={() => {
          setInvite({ fullName: '', email: '', roleId: roles[0]?.id || '' });
          setShowInviteModal(true);
        }}>+ Add User</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedRoleId ? '1fr 1.2fr 1fr' : '2fr 1fr', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px' }}>Active Users</h3>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>
                      {editingUserId === u.id ? (
                        <select value={u.roleId || ''} onChange={e => handleUserRoleChange(u.id, e.target.value)} className="jem-field" style={{ fontSize: '0.85rem' }}>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      ) : (
                        <span className="status-pill active">{u.role?.name || '—'}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-small" type="button" onClick={() => setEditingUserId(editingUserId === u.id ? null : u.id)}>
                        {editingUserId === u.id ? 'Done' : 'Edit role'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No users in this company yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedRoleId && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Permissions</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedRole?.name}</p>
                </div>
                <button className="btn-glow" onClick={saveRolePermissions} disabled={savingPerms}>
                  {savingPerms ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {Object.entries(groupedCatalog).map(([resource, perms]) => (
                  <div key={resource} style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: 8, color: 'var(--color-primary)' }}>{resource}</div>
                    {perms.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                        <input type="checkbox" checked={selectedPermIds.has(p.id)} onChange={() => togglePermission(p.id)} />
                        <code style={{ fontSize: '0.82rem' }}>{p.action}</code>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({p.key})</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px 12px 20px', background: 'rgba(13, 148, 136, 0.1)', borderBottom: securityRolesOpen ? '1px solid var(--border, rgba(0,0,0,0.08))' : 'none' }}>
              <button type="button" onClick={() => setSecurityRolesOpen(o => !o)} aria-expanded={securityRolesOpen}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '4px 0', margin: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Security Roles</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {roles.length} role{roles.length === 1 ? '' : 's'} · click role to edit permissions
                  </p>
                </div>
                <span aria-hidden style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary, #0d9488)', transform: securityRolesOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}>▼</span>
              </button>
              <button type="button" className="btn-secondary" onClick={e => { e.stopPropagation(); setNewRoleName(''); setShowRoleModal(true); }} style={{ flexShrink: 0 }}>Add Role</button>
            </div>
            {securityRolesOpen && (
              <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {roles.map(r => (
                  <div key={r.id} onClick={() => selectRole(r.id)}
                    style={{
                      padding: '16px', borderRadius: '8px', cursor: 'pointer',
                      background: selectedRoleId === r.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selectedRoleId === r.id ? '1px solid var(--color-primary)' : '1px solid var(--border)'
                    }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{r.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {r.rolePermissions?.length ?? 0} permissions
                    </div>
                  </div>
                ))}
                {roles.length === 0 && !loading && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>No roles yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showInviteModal && (
        <ModalPortal onClose={() => setShowInviteModal(false)}>
          <JemShellModal title="Invite new user" subtitle="Create an account and assign a security role" onClose={() => setShowInviteModal(false)} size="md" pill="ACC"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button><button type="submit" form="access-invite-form" className="jem-btn-primary" disabled={roles.length === 0}>Create user</button></>}>
            <form id="access-invite-form" onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="jem-input-group"><span className="jem-label">Full name</span><input required className="jem-field" value={invite.fullName} onChange={e => setInvite({ ...invite, fullName: e.target.value })} /></div>
              <div className="jem-input-group"><span className="jem-label">Email</span><input type="email" required className="jem-field" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} /></div>
              <div className="jem-input-group"><span className="jem-label">Role</span>
                <select required className="jem-field" value={invite.roleId} onChange={e => setInvite({ ...invite, roleId: e.target.value })}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}

      {showRoleModal && (
        <ModalPortal onClose={() => setShowRoleModal(false)}>
          <JemShellModal title="Add role" subtitle="A named set of permissions for your workspace" onClose={() => setShowRoleModal(false)} size="sm" pill="RL"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowRoleModal(false)}>Cancel</button><button type="submit" form="access-role-form" className="jem-btn-primary">Create</button></>}>
            <form id="access-role-form" onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="jem-input-group"><span className="jem-label">Role name</span><input required className="jem-field" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} /></div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default AccessManagement;
