import { useState } from 'react';
import { CreateRoomForm } from '../components/CreateRoomForm';
import { JoinRoomForm } from '../components/JoinRoomForm';
import { Film } from 'lucide-react';
import '../styles/landing.css';

export const LandingPage = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

  return (
    <div className="landing-container">
      <div className="glass-card">
        <header className="landing-header">
          <h1>
            <Film size={32} color="#6c5ce7" />
            Watch Party
          </h1>
          <p>Sync YouTube videos with friends in real-time</p>
        </header>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Party
          </button>
          <button
            className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            Join Party
          </button>
        </div>

        <div className="form-container">
          {activeTab === 'create' ? <CreateRoomForm /> : <JoinRoomForm />}
        </div>
      </div>
    </div>
  );
};
