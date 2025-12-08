import React from 'react';

interface AdminPanelProps {
  useMockData: boolean;
  setUseMockData: (val: boolean) => void;
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ useMockData, setUseMockData, onLogout }) => {
  return (
    <div className="min-h-screen bg-cyber-black text-cyber-text p-10 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full glass-panel p-8 rounded-xl shadow-neon-red border border-cyber-border relative overflow-hidden hover:shadow-red-500/30 transition-shadow duration-500">
        
        {/* Decorative Grid */}
        <div className="absolute top-0 right-0 p-4 opacity-20">
             <i className="fas fa-microchip text-9xl text-cyber-accent"></i>
        </div>

        <div className="flex justify-between items-center mb-8 relative z-10">
            <h1 className="text-3xl font-bold text-cyber-accent flex items-center gap-3">
                <i className="fas fa-shield-alt animate-pulse"></i>
                Admin Control
            </h1>
            <button onClick={onLogout} className="text-cyber-dim hover:text-white border border-cyber-border px-3 py-1 rounded hover:border-white transition-all">Sign Out</button>
        </div>
        
        <div className="space-y-6 relative z-10">
          <div className="bg-cyber-dark p-6 rounded-lg border border-cyber-border flex items-center justify-between hover:border-cyber-accent/50 transition-colors hover:shadow-lg">
            <div>
              <h3 className="text-xl font-bold mb-2 text-white">Data Mode</h3>
              <p className="text-cyber-dim text-sm font-mono">
                Toggle between live Firebase data and mock data.
                <br/>
                <span className={`text-xs mt-1 inline-block ${useMockData ? 'text-cyber-accent font-bold animate-pulse' : 'text-cyber-primary'}`}>STATUS: {useMockData ? 'MOCK DATA' : 'LIVE DATA'}</span>
              </p>
            </div>
            
            <label className="inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={useMockData}
                onChange={(e) => setUseMockData(e.target.checked)}
              />
              <div className="relative w-14 h-7 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-cyber-accent shadow-inner"></div>
            </label>
          </div>

          <div className="bg-cyber-dark p-6 rounded-lg border border-cyber-border hover:shadow-lg transition-shadow">
             <h3 className="text-xl font-bold mb-4 text-white">System Status</h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-cyber-black p-3 rounded text-cyber-primary border border-cyber-primary/20 flex items-center gap-2 hover:bg-cyber-primary/10 transition-colors">
                    <div className="w-2 h-2 bg-cyber-primary rounded-full animate-pulse"></div> Auth Service: ONLINE
                </div>
                <div className="bg-cyber-black p-3 rounded text-cyber-primary border border-cyber-primary/20 flex items-center gap-2 hover:bg-cyber-primary/10 transition-colors">
                    <div className="w-2 h-2 bg-cyber-primary rounded-full animate-pulse"></div> AI Service: CONNECTED
                </div>
                <div className="bg-cyber-black p-3 rounded text-cyber-primary border border-cyber-primary/20 flex items-center gap-2 hover:bg-cyber-primary/10 transition-colors">
                    <div className="w-2 h-2 bg-cyber-primary rounded-full animate-pulse"></div> Database: SYNCED
                </div>
                <div className="bg-cyber-black p-3 rounded text-cyber-secondary border border-cyber-secondary/20 flex items-center gap-2 hover:bg-cyber-secondary/10 transition-colors">
                    <div className="w-2 h-2 bg-cyber-secondary rounded-full animate-pulse"></div> Security: ACTIVE
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;