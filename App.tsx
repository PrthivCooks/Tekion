import React, { useState, useEffect } from 'react';
import { 
  auth, 
  getUserProfile, 
  registerUserInFirestore
} from './services/firebase';
import { validateAccountCreation } from './services/geminiService';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { User, Seller, Role } from './types';
import SellerDashboard from './components/SellerDashboard';
import UserDashboard from './components/UserDashboard';
import AdminPanel from './components/AdminPanel';

function App() {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(false); // Admin toggle

  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [dealershipName, setDealershipName] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false); 
  
  // Validation State
  const [valResult, setValResult] = useState<any>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        if (firebaseUser.email === 'admin@teckion.com') {
             setCurrentUser({ uid: 'admin_1', email: 'admin@teckion.com', name: 'Admin', role: 'admin', created_at: '' });
             setLoading(false);
             return;
        }

        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          setCurrentUser(profile);
        } else {
            setCurrentUser({ uid: firebaseUser.uid, email: firebaseUser.email || '', name: 'Unknown', role: 'user', created_at: '' });
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthProcessing(true);
    setErrorMsg('');
    setValResult(null);

    try {
      if (isLogin) {
        if (isAdminMode) {
             if (email === 'admin@teckion.com' && password === 'admin123') {
                 setCurrentUser({ uid: 'admin_1', email, name: 'Admin', role: 'admin', created_at: '' });
                 setIsAuthProcessing(false);
                 return;
             }
        }
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const validation = await validateAccountCreation(name, email, role, dealershipName);
        
        if (!validation.is_valid && validation.risk_score > 0.7) {
            setValResult(validation);
            throw new Error("Account rejected by AI Security Risk Assessment.");
        }

        if (!validation.is_valid) {
            setValResult(validation);
            return; 
        }

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const userData: any = { name, email };
        if (role === 'seller') userData.dealership_name = dealershipName;
        
        await registerUserInFirestore(userCred.user.uid, userData, role);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg("This email is already linked to an existing account. Please log in.");
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg("The email address provided is invalid.");
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg("The password is too weak. Please use at least 6 characters.");
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg("Invalid email or password.");
      } else {
        setErrorMsg(err.message || "Authentication process interrupted.");
      }
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser?.role === 'admin') {
        setCurrentUser(null); 
    } else {
        await signOut(auth);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-cyber-black text-cyber-primary"><i className="fas fa-circle-notch fa-spin text-4xl shadow-neon-blue rounded-full"></i></div>;
  }

  // --- RENDER DASHBOARDS BASED ON ROLE ---
  if (currentUser) {
    if (currentUser.role === 'admin') {
      return <AdminPanel useMockData={useMockData} setUseMockData={setUseMockData} onLogout={handleLogout} />;
    }
    if (currentUser.role === 'seller') {
      return <SellerDashboard seller={currentUser as Seller} useMockData={useMockData} onLogout={handleLogout} />;
    }
    return <UserDashboard user={currentUser} useMockData={useMockData} onLogout={handleLogout} />;
  }

  // --- LOGIN / SIGNUP SCREEN ---
  return (
    <div className="min-h-screen bg-cyber-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyber-primary/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyber-secondary/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="max-w-md w-full glass-panel rounded-2xl border border-cyber-border shadow-2xl relative z-10 backdrop-blur-xl">
        <div className="p-8">
            <div className="text-center mb-8">
                <div className="inline-block p-4 rounded-full bg-cyber-dark border border-cyber-border shadow-neon-blue mb-4 animate-float">
                    <i className="fas fa-car text-3xl text-cyber-primary"></i>
                </div>
                <h1 className="text-3xl font-bold text-white tracking-widest font-sans">TECKION</h1>
                <p className="text-cyber-dim text-sm mt-2">{isLogin ? 'Sign in to your account' : 'Create a new account'}</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
                {!isLogin && (
                    <div className="grid grid-cols-2 gap-2 p-1 bg-cyber-dark rounded-lg border border-cyber-border">
                        <button type="button" onClick={() => setRole('user')} className={`py-2 text-xs font-bold uppercase tracking-wider rounded transition-all ${role === 'user' ? 'bg-cyber-primary text-cyber-black shadow-neon-blue' : 'text-cyber-dim'}`}>User</button>
                        <button type="button" onClick={() => setRole('seller')} className={`py-2 text-xs font-bold uppercase tracking-wider rounded transition-all ${role === 'seller' ? 'bg-cyber-primary text-cyber-black shadow-neon-blue' : 'text-cyber-dim'}`}>Seller</button>
                    </div>
                )}

                {!isLogin && (
                    <div>
                        <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-cyber-black border border-cyber-border rounded-lg focus:border-cyber-primary focus:shadow-neon-blue outline-none text-white transition-all placeholder-cyber-dim" placeholder="Full Name" />
                    </div>
                )}

                {!isLogin && role === 'seller' && (
                    <div>
                        <input required type="text" value={dealershipName} onChange={e => setDealershipName(e.target.value)} className="w-full p-3 bg-cyber-black border border-cyber-border rounded-lg focus:border-cyber-primary focus:shadow-neon-blue outline-none text-white transition-all placeholder-cyber-dim" placeholder="Dealership Name" />
                    </div>
                )}

                <div>
                    <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 bg-cyber-black border border-cyber-border rounded-lg focus:border-cyber-primary focus:shadow-neon-blue outline-none text-white transition-all placeholder-cyber-dim" placeholder="Email Address" />
                </div>

                <div>
                    <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-cyber-black border border-cyber-border rounded-lg focus:border-cyber-primary focus:shadow-neon-blue outline-none text-white transition-all placeholder-cyber-dim" placeholder="Password" />
                </div>

                {isLogin && (
                    <div className="flex items-center gap-2 mt-2">
                        <input type="checkbox" id="adminMode" checked={isAdminMode} onChange={e => setIsAdminMode(e.target.checked)} className="rounded bg-cyber-black border-cyber-border text-cyber-primary focus:ring-0" />
                        <label htmlFor="adminMode" className="text-xs text-cyber-dim hover:text-cyber-primary cursor-pointer transition-colors">Admin Login</label>
                    </div>
                )}

                {valResult && !valResult.is_valid && (
                    <div className="bg-cyber-accent/10 p-3 rounded border border-cyber-accent text-xs text-cyber-accent">
                        <p className="font-bold mb-1 flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Security Alert:</p>
                        <ul className="list-disc pl-4 opacity-80">
                            {valResult.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                    </div>
                )}

                {errorMsg && <div className="text-cyber-accent text-sm text-center font-bold animate-pulse">{errorMsg}</div>}

                <button 
                    type="submit" 
                    disabled={isAuthProcessing}
                    className="w-full bg-cyber-primary text-cyber-black font-bold py-3 rounded-lg hover:bg-white hover:scale-[1.02] transition-all shadow-neon-blue disabled:opacity-50 disabled:cursor-not-allowed mt-4 uppercase tracking-widest"
                >
                    {isAuthProcessing ? <span className="animate-pulse">Loading...</span> : (isLogin ? 'Sign In' : 'Sign Up')}
                </button>
            </form>

            <div className="mt-6 text-center">
                <button onClick={() => { setIsLogin(!isLogin); setValResult(null); setErrorMsg(''); }} className="text-cyber-dim hover:text-cyber-primary text-xs font-mono tracking-wider transition-colors">
                    {isLogin ? "Create an account" : "Back to Sign In"}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;