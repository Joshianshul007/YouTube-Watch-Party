import { useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { Users, Crown, Shield, MoreVertical, UserMinus, ArrowRightLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { ChatPanel } from './ChatPanel';

export const ParticipantList = () => {
  const { participants, role, socket } = useRoom();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const isHost = role === 'host';

  const getRoleIcon = (r: string) => {
    switch (r) {
      case 'host':
        return <Crown size={16} color="#ffd700" />;
      case 'moderator':
        return <Shield size={16} color="#6c5ce7" />;
      default:
        return null;
    }
  };

  const handlePromote = (targetId: string) => {
    if (!socket) return;
    socket.emit('assign_role', { targetUserId: targetId, role: 'moderator' });
    setOpenMenuId(null);
  };

  const handleDemote = (targetId: string) => {
    if (!socket) return;
    socket.emit('assign_role', { targetUserId: targetId, role: 'participant' });
    setOpenMenuId(null);
  };

  const handleKick = (targetId: string, username: string) => {
    if (!socket) return;
    if (!window.confirm(`Remove ${username} from the room?`)) return;
    socket.emit('remove_participant', { targetUserId: targetId });
    setOpenMenuId(null);
  };

  const handleTransferHost = (targetId: string, username: string) => {
    if (!socket) return;
    if (!window.confirm(`Transfer host to ${username}? You will lose host controls.`)) return;
    socket.emit('transfer_host', { targetUserId: targetId });
    setOpenMenuId(null);
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId(prev => prev === id ? null : id);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Users size={20} />
        Participants ({participants.length})
      </div>
      
      <div className="participant-list">
        {participants.map((p) => (
          <div key={p.id} className="participant-item">
            <div className="participant-info">
              <div className="avatar">
                {p.username.charAt(0).toUpperCase()}
              </div>
              <div className="participant-details">
                <span style={{ fontWeight: 500 }}>{p.username}</span>
                <span className="role-label">{p.role}</span>
              </div>
            </div>
            <div className="participant-actions">
              {getRoleIcon(p.role)}
              
              {/* Host action menu — only visible to the host, and not on themselves */}
              {isHost && p.role !== 'host' && (
                <div className="action-menu-wrapper">
                  <button 
                    className="btn-icon btn-icon-sm" 
                    onClick={() => toggleMenu(p.id)}
                    title="Manage"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {openMenuId === p.id && (
                    <div className="action-dropdown">
                      {p.role === 'participant' ? (
                        <button className="dropdown-item" onClick={() => handlePromote(p.id)}>
                          <ChevronUp size={14} />
                          Promote to Moderator
                        </button>
                      ) : (
                        <button className="dropdown-item" onClick={() => handleDemote(p.id)}>
                          <ChevronDown size={14} />
                          Demote to Participant
                        </button>
                      )}
                      <button className="dropdown-item" onClick={() => handleTransferHost(p.id, p.username)}>
                        <ArrowRightLeft size={14} />
                        Transfer Host
                      </button>
                      <button className="dropdown-item dropdown-item-danger" onClick={() => handleKick(p.id, p.username)}>
                        <UserMinus size={14} />
                        Kick
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <ChatPanel />
    </aside>
  );
};
