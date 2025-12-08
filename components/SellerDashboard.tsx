
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { fetchAnalytics, fetchVehicles, saveVehicle, fetchSellerInteractions, respondToQuery, seedDatabase, updateContractStatus, deleteDocument, updateUserProfile, getUserProfile } from '../services/firebase';
import { queryAnalyticsChatbot, generateSellerContractTemplate, refineContractText, identifySellerPlaceholders, fillSellerVariables, verifyRevisionCompliance } from '../services/geminiService';
import { AnalyticsData, Vehicle, Seller, UserQuery, Contract, User, InsurancePlan } from '../types';
import { DotScreenShader } from './ui/dot-shader-background';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, Legend, AreaChart, Area,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis
} from 'recharts';

interface SellerDashboardProps {
  seller: Seller;
  useMockData: boolean;
  onLogout: () => void;
}

const SellerDashboard: React.FC<SellerDashboardProps> = ({ seller, useMockData, onLogout }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'interactions'>('overview');
  
  // Profile State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
      name: seller.name,
      dealership_name: seller.dealership_name,
      emp_id: seller.emp_id || '',
      designation: seller.designation || ''
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Buyer Profile Viewing State
  const [viewingBuyer, setViewingBuyer] = useState<User | null>(null);
  const [loadingBuyer, setLoadingBuyer] = useState(false);

  // CRM State
  const [queries, setQueries] = useState<UserQuery[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [replyText, setReplyText] = useState<{[key: string]: string}>({});

  // Chatbot State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Add/Edit Vehicle Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  // Deletion State
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [contractCopilotQuery, setContractCopilotQuery] = useState('');
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Seller Contract Input State
  const [showSellerInputModal, setShowSellerInputModal] = useState(false);
  const [sellerFields, setSellerFields] = useState<string[]>([]);
  const [sellerInputValues, setSellerInputValues] = useState<Record<string, string>>({});
  const [tempDraftTemplate, setTempDraftTemplate] = useState(''); 

  // Contract Revision / View State
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [revisionHtml, setRevisionHtml] = useState('');
  const [sellerNote, setSellerNote] = useState('');
  const [isUpdatingContract, setIsUpdatingContract] = useState(false);
  const revisionEditorRef = useRef<HTMLDivElement>(null);
  const templateEditorRef = useRef<HTMLDivElement>(null);
  
  // Revision Copilot State
  const [revisionCopilotQuery, setRevisionCopilotQuery] = useState('');
  const [isRevisionThinking, setIsRevisionThinking] = useState(false);

  // Filters State
  const [filterVehicle, setFilterVehicle] = useState('All');
  const [filterContractStatus, setFilterContractStatus] = useState('All');
  const [filterQueryStatus, setFilterQueryStatus] = useState('All');

  const DEFAULT_TEMPLATE = `<h3>VEHICLE SALES AGREEMENT</h3><br><p><b>1. THE PARTIES</b><br>Buyer: {{buyer_name}}<br>Seller: ${seller.dealership_name}</p><br><p><b>2. THE VEHICLE</b><br>Model: {{vehicle_name}}<br>VIN: [VIN]</p><br><p><b>3. PURCHASE PRICE</b><br>The Buyer agrees to pay the sum of [PRICE] for the Vehicle.</p>`;

  // Enhanced Form State
  const [vehicleForm, setVehicleForm] = useState({
    name: '', 
    trim: '', 
    drive: 'FWD', 
    price: '', 
    seats: 5,
    terrain: 'City Streets',
    primaryUse: 'Daily Commute',
    petFriendly: false,
    imageUrl: '', 
    visualDesc: '',
    contractTemplate: DEFAULT_TEMPLATE,
    region: 'Delhi NCR',
    insurancePlans: [] as InsurancePlan[]
  });

  // Insurance Sub-form state
  const [newPlan, setNewPlan] = useState<Partial<InsurancePlan>>({ type: 'Comprehensive' });

  useEffect(() => {
    const loadData = async () => {
      const aData = await fetchAnalytics(useMockData);
      const vData = await fetchVehicles(useMockData);
      setAnalytics(aData);
      setVehicles(vData);

      const interactions = await fetchSellerInteractions(useMockData);
      setQueries(interactions.queries);
      setContracts(interactions.contracts);
    };
    loadData();
  }, [useMockData, isProcessing, isUpdatingContract]); 

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- FILTERED LISTS ---
  const filteredVehicles = vehicles.filter(v => filterVehicle === 'All' || v.drive === filterVehicle);
  const filteredContracts = contracts.filter(c => filterContractStatus === 'All' || c.status === filterContractStatus);
  const filteredQueries = queries.filter(q => filterQueryStatus === 'All' || q.status === filterQueryStatus);

  // --- DYNAMIC ANALYTICS CALCULATIONS ---
  const calculatedMetrics = useMemo(() => {
      const pending = contracts.filter(c => c.status === 'pending').length;
      const accepted = contracts.filter(c => c.status === 'accepted').length;
      const rejected = contracts.filter(c => c.status === 'rejected').length;
      const needsChanges = contracts.filter(c => c.status === 'needs_changes').length;
      const total = contracts.length;

      let revenue = 0;
      contracts.filter(c => c.status === 'accepted').forEach(c => {
          const v = vehicles.find(vh => vh.id === c.vehicleId);
          if (v) revenue += v.price_range[0];
      });

      const conversionRate = total > 0 ? ((accepted / total) * 100).toFixed(1) : '0.0';

      return { pending, accepted, rejected, needsChanges, total, revenue, conversionRate };
  }, [contracts, vehicles]);

  // --- CHART DATA PREPARATION ---
  const extendedChartData = useMemo(() => {
      // 1. Budget Distribution
      const budgetBuckets = { 'Under 15L': 0, '15L-30L': 0, '30L-60L': 0, '60L+': 0 };
      vehicles.forEach(v => {
          const price = v.price_range[0];
          if (price < 1500000) budgetBuckets['Under 15L']++;
          else if (price < 3000000) budgetBuckets['15L-30L']++;
          else if (price < 6000000) budgetBuckets['30L-60L']++;
          else budgetBuckets['60L+']++;
      });
      const budgetData = Object.keys(budgetBuckets).map(k => ({ name: k, count: budgetBuckets[k as keyof typeof budgetBuckets] }));

      // 2. Terrain / Usage Analysis
      const usageCounts: Record<string, number> = {};
      contracts.forEach(c => {
          const v = vehicles.find(vh => vh.id === c.vehicleId);
          if (v) {
              v.use_cases.forEach(u => {
                  usageCounts[u] = (usageCounts[u] || 0) + 1;
              });
          }
      });
      const topUsage = Object.entries(usageCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 6)
          .map(([subject, A]) => ({ subject, A, fullMark: Math.max(...Object.values(usageCounts)) }));

      // 3. Contract Status
      const statusData = [
          { name: 'Pending', value: calculatedMetrics.pending, color: '#eab308' }, 
          { name: 'Accepted', value: calculatedMetrics.accepted, color: '#22c55e' }, 
          { name: 'Rejected', value: calculatedMetrics.rejected, color: '#ef4444' }, 
          { name: 'Changes Requested', value: calculatedMetrics.needsChanges, color: '#f97316' }, // Orange
      ].filter(d => d.value > 0);

      // 4. Revenue Trend
      const revenueTrend = [
          { name: 'Week 1', revenue: calculatedMetrics.revenue * 0.1 },
          { name: 'Week 2', revenue: calculatedMetrics.revenue * 0.25 },
          { name: 'Week 3', revenue: calculatedMetrics.revenue * 0.5 },
          { name: 'Week 4', revenue: calculatedMetrics.revenue },
      ];

      // 5. Budget Trend (Line)
      const budgetTrend = [
          { date: 'Jan', avgBudget: 1500000 },
          { date: 'Feb', avgBudget: 1800000 },
          { date: 'Mar', avgBudget: 1600000 },
          { date: 'Apr', avgBudget: 2200000 },
          { date: 'May', avgBudget: 2500000 },
          { date: 'Jun', avgBudget: 3000000 },
      ];

      // 6. Car Type Trends (Line)
      const carTypeTrend = [
          { name: 'Week 1', SUV: 10, Sedan: 5, EV: 2 },
          { name: 'Week 2', SUV: 12, Sedan: 4, EV: 3 },
          { name: 'Week 3', SUV: 15, Sedan: 6, EV: 6 },
          { name: 'Week 4', SUV: 18, Sedan: 5, EV: 9 },
      ];

      // 7. Terrain Interest Trend (Line)
      const terrainTrend = [
          { name: 'Q1', City: 40, OffRoad: 20 },
          { name: 'Q2', City: 45, OffRoad: 25 },
          { name: 'Q3', City: 42, OffRoad: 35 },
          { name: 'Q4', City: 50, OffRoad: 40 },
      ];

      // 8. Inventory Age (Bar)
      const inventoryAge = [
          { name: '0-30 Days', count: vehicles.length * 0.4 },
          { name: '31-60 Days', count: vehicles.length * 0.3 },
          { name: '61-90 Days', count: vehicles.length * 0.2 },
          { name: '90+ Days', count: vehicles.length * 0.1 },
      ];

      return { budgetData, topUsage, statusData, revenueTrend, budgetTrend, carTypeTrend, terrainTrend, inventoryAge };
  }, [vehicles, contracts, calculatedMetrics]);

  // --- HANDLERS ---

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsUpdatingProfile(true);
      try {
          await updateUserProfile(seller.uid, 'seller', profileForm);
          setShowProfileModal(false);
          alert("Profile updated successfully!");
      } catch(e) {
          console.error(e);
          alert("Failed to update profile.");
      } finally {
          setIsUpdatingProfile(false);
      }
  }

  const handleViewBuyerProfile = async (userId: string) => {
      setLoadingBuyer(true);
      setViewingBuyer(null);
      try {
          const userData = await getUserProfile(userId);
          if (userData && userData.role === 'user') {
              setViewingBuyer(userData as User);
          } else {
              alert("Could not fetch buyer details.");
          }
      } catch (e) {
          console.error(e);
          alert("Error fetching buyer data.");
      } finally {
          setLoadingBuyer(false);
      }
  }

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;
    const userMsg = chatQuery;
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatQuery('');
    setChatLoading(true);
    const context = { analytics, inventory_summary: { total_vehicles: vehicles.length }, timestamp: new Date().toISOString() };
    const answer = await queryAnalyticsChatbot(userMsg, context);
    setChatHistory(prev => [...prev, { role: 'ai', text: answer }]);
    setChatLoading(false);
  };

  const handleReplySubmit = async (qId: string) => {
      const txt = replyText[qId];
      if (!txt) return;
      await respondToQuery(qId, txt);
      
      setQueries(prev => prev.map(q => q.id === qId ? {...q, status: 'closed', reply: txt} : q));
      setReplyText(prev => ({...prev, [qId]: ''}));
  };

  const handleContractCopilotSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!contractCopilotQuery.trim()) return;
      const instruction = contractCopilotQuery;
      setContractCopilotQuery('');
      setIsCopilotThinking(true);
      try {
          // If we have content in the editor ref, use that as the source, otherwise use state
          const currentContent = templateEditorRef.current?.innerHTML || vehicleForm.contractTemplate;
          const newText = await refineContractText(currentContent, instruction);
          setVehicleForm(prev => ({ ...prev, contractTemplate: newText }));
          // Also update ref manually to reflect changes immediately without needing full re-render logic if managed weirdly
          if (templateEditorRef.current) templateEditorRef.current.innerHTML = newText;
      } catch (err) { console.error(err); } finally { setIsCopilotThinking(false); }
  };

  const handleRevisionCopilotSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!revisionCopilotQuery.trim()) return;
      const instruction = revisionCopilotQuery;
      setRevisionCopilotQuery('');
      setIsRevisionThinking(true);
      try {
          const currentText = revisionEditorRef.current?.innerHTML || revisionHtml;
          const newText = await refineContractText(currentText, instruction);
          setRevisionHtml(newText);
          if (revisionEditorRef.current) revisionEditorRef.current.innerHTML = newText;
      } catch(err) {
          console.error(err);
      } finally {
          setIsRevisionThinking(false);
      }
  }

  const handleGenerateTemplate = async () => {
      setIsGeneratingTemplate(true);
      try {
          // 1. Generate the initial U.S. style draft
          const draft = await generateSellerContractTemplate(vehicleForm, vehicleForm.region);
          
          // 2. Scan for placeholders in that draft
          const sellerFields = await identifySellerPlaceholders(draft);
          
          if (sellerFields.length > 0) {
              setTempDraftTemplate(draft);
              setSellerFields(sellerFields);
              
              // 3. Pre-fill common values if found in variable name
              const initValues: Record<string, string> = {};
              sellerFields.forEach(f => {
                  const label = f.toLowerCase();
                  if (label.includes('date')) initValues[f] = new Date().toLocaleDateString();
                  else if (label.includes('price')) initValues[f] = vehicleForm.price;
                  else if (label.includes('model') || label.includes('vehicle')) initValues[f] = `${vehicleForm.name} ${vehicleForm.trim}`;
                  else initValues[f] = '';
              });
              setSellerInputValues(initValues);
              
              // 4. SHOW THE MISSING MODAL
              setShowSellerInputModal(true);
          } else {
              setVehicleForm(prev => ({ ...prev, contractTemplate: draft }));
          }
      } catch (err) { 
          console.error(err); 
          alert("Failed to generate contract.");
      } finally { 
          setIsGeneratingTemplate(false); 
      }
  }
  
  const handleFinalizeSellerTemplate = async () => {
      setIsProcessing(true);
      try {
          const finalDraft = await fillSellerVariables(tempDraftTemplate, sellerInputValues);
          setVehicleForm(prev => ({ ...prev, contractTemplate: finalDraft }));
          setShowSellerInputModal(false);
      } catch (e) {
          console.error(e);
          alert("Failed to fill contract variables.");
      } finally {
          setIsProcessing(false);
      }
  }

  const openContractModal = (contract: Contract) => {
      setSelectedContract(contract);
      setRevisionHtml(contract.contract_html);
      setSellerNote('');
      setShowContractModal(true);
  }

  const handleUpdateContract = async (withNegotiation: boolean = false) => {
      if (!selectedContract) return;
      setIsUpdatingContract(true);
      
      const content = revisionEditorRef.current?.innerHTML || revisionHtml;

      if (!withNegotiation) {
          const requestMsg = selectedContract.change_request_message || "General Revision";
          const compliance = await verifyRevisionCompliance(selectedContract.contract_html, content, requestMsg);
          
          if (!compliance.satisfied) {
              if (!confirm(`AI Warning: The revision might not fully satisfy the buyer's request.\nReason: ${compliance.reason}\n\nSend anyway?`)) {
                  setIsUpdatingContract(false);
                  return;
              }
          }
      }

      try {
          await updateContractStatus(selectedContract.id, 'pending', undefined, { 
              contract_html: content,
              change_request_message: '',
              seller_note: withNegotiation ? sellerNote : ''
          });
          setShowContractModal(false);
          alert(withNegotiation ? "Negotiation note and contract sent." : "Contract updated and sent back to buyer for review.");
      } catch(e) {
          console.error(e);
          alert("Failed to update contract.");
      } finally {
          setIsUpdatingContract(false);
      }
  }

  // --- DELETE HANDLER (FIXED) ---
  const handleDelete = async (e: React.MouseEvent, collectionName: string, id: string) => {
      e.preventDefault();
      e.stopPropagation(); 
      
      if (!confirm("Are you sure you want to remove this item? This action cannot be undone.")) return;
      
      setDeletingIds(prev => new Set(prev).add(id));
      
      try {
          await deleteDocument(collectionName, id);
          
          if (collectionName === 'vehicles') {
              setVehicles(prev => prev.filter(v => v.id !== id));
          } else if (collectionName === 'contracts') {
              setContracts(prev => prev.filter(c => c.id !== id));
          } else if (collectionName === 'queries') {
              setQueries(prev => prev.filter(q => q.id !== id));
          }
      } catch (e) {
          console.error("Delete failed:", e);
          alert("Failed to delete item. Please try again.");
      } finally {
          setDeletingIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
      }
  }

  const openEditModal = (v: Vehicle) => {
      setEditingVehicleId(v.id);
      const isPetFriendly = v.use_cases.some(u => ['Dogs', 'Pets'].includes(u));
      let terrain = 'City Streets';
      if (v.use_cases.some(u => ['Off-road', 'Trekking'].includes(u))) terrain = 'Rough Terrain/Off-road';
      let usage = 'Daily Commute';
      if (v.use_cases.some(u => ['Family'].includes(u))) usage = 'Family Transport';

      setVehicleForm({
          name: v.name, trim: v.trim, drive: v.drive, price: v.price_range[0].toString(), seats: v.seats || 5,
          terrain: terrain, primaryUse: usage, petFriendly: isPetFriendly,
          contractTemplate: v.contract_template || DEFAULT_TEMPLATE, imageUrl: v.image_url || '', visualDesc: v.visual_desc || '', region: 'Delhi NCR',
          insurancePlans: v.insurance_options || []
      });
      setShowAddModal(true);
  };

  const openAddModal = () => {
      setEditingVehicleId(null);
      setVehicleForm({
        name: '', trim: '', drive: 'FWD', price: '', seats: 5,
        terrain: 'City Streets', primaryUse: 'Daily Commute', petFriendly: false,
        imageUrl: '', visualDesc: '', contractTemplate: DEFAULT_TEMPLATE, region: 'Delhi NCR', insurancePlans: []
      });
      setShowAddModal(true);
  }

  const handleAddInsurancePlan = () => {
      if (!newPlan.provider || !newPlan.name || !newPlan.premium) return;
      const plan: InsurancePlan = {
          id: 'plan-' + Date.now(),
          provider: newPlan.provider!,
          name: newPlan.name!,
          premium: Number(newPlan.premium),
          type: newPlan.type as any || 'Comprehensive',
          addons: (newPlan.addons as any)?.split(',').map((s:string) => s.trim()) || [],
          coverage_details: newPlan.coverage_details || 'Standard coverage'
      };
      setVehicleForm(prev => ({ ...prev, insurancePlans: [...prev.insurancePlans, plan] }));
      setNewPlan({ type: 'Comprehensive', provider: '', name: '', premium: 0, addons: [] as any, coverage_details: '' });
  }

  const handleRemovePlan = (id: string) => {
      setVehicleForm(prev => ({ ...prev, insurancePlans: prev.insurancePlans.filter(p => p.id !== id) }));
  }

  const handleSaveVehicle = async () => {
    setIsProcessing(true);
    try {
      const priceVal = parseInt(vehicleForm.price) || 0;
      // Ensure we grab latest content from div if it was edited
      const finalTemplate = templateEditorRef.current?.innerHTML || vehicleForm.contractTemplate;
      
      const vData: any = {
          ...(editingVehicleId ? { id: editingVehicleId } : {}),
          name: vehicleForm.name, trim: vehicleForm.trim, drive: vehicleForm.drive, seats: vehicleForm.seats,
          price_range: [priceVal, priceVal * 1.1], use_cases: ['General'], f_and_i: ['Standard'], 
          image_url: vehicleForm.imageUrl, contract_template: finalTemplate, visual_desc: vehicleForm.visualDesc,
          insurance_options: vehicleForm.insurancePlans
      };
      await saveVehicle(vData);
      
      if (!editingVehicleId) {
          const vData = await fetchVehicles(useMockData);
          setVehicles(vData);
      }
      
      setShowAddModal(false);
    } catch (e) { alert("Failed to save vehicle."); } finally { setIsProcessing(false); }
  };

  const handleSeed = async () => {
      if (!confirm("Add 10 vehicles?")) return;
      setIsProcessing(true);
      await seedDatabase();
      setIsProcessing(false);
  };

  const handleSendReminder = async (contractId: string) => {
      alert("Reminder sent!");
  }

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-text flex flex-col font-sans relative overflow-hidden">
      <DotScreenShader />

      {/* Seller Profile Modal */}
      {showProfileModal && (
           <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-md rounded-xl border border-cyber-primary shadow-neon-blue flex flex-col animate-scale-in">
                   <div className="p-4 border-b border-cyber-border bg-cyber-dark flex justify-between items-center rounded-t-xl">
                       <h3 className="text-lg font-bold text-white"><i className="fas fa-id-card mr-2"></i> Seller Profile</h3>
                       <button onClick={() => setShowProfileModal(false)} className="text-cyber-dim hover:text-white"><i className="fas fa-times"></i></button>
                   </div>
                   <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Name</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Organization Name</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.dealership_name} onChange={e => setProfileForm({...profileForm, dealership_name: e.target.value})} />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Designation</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.designation} onChange={e => setProfileForm({...profileForm, designation: e.target.value})} placeholder="e.g. Sales Manager" />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Employee ID</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.emp_id} onChange={e => setProfileForm({...profileForm, emp_id: e.target.value})} />
                       </div>
                       <button type="submit" disabled={isUpdatingProfile} className="w-full bg-cyber-primary text-black font-bold py-2 rounded mt-4 hover:bg-white transition-all disabled:opacity-50">
                           {isUpdatingProfile ? <i className="fas fa-spinner fa-spin"></i> : "Update Profile"}
                       </button>
                   </form>
               </div>
           </div>
       )}
       
       {/* THIS WAS MISSING: Seller Input Modal for AI Generated Contracts */}
       {showSellerInputModal && (
           <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-lg rounded-xl border border-cyber-primary shadow-neon-blue flex flex-col animate-scale-in">
                   <div className="p-6 border-b border-cyber-border bg-cyber-dark rounded-t-xl">
                       <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-magic text-cyber-primary"></i> Fill Contract Details</h3>
                       <p className="text-xs text-cyber-dim mt-1">AI detected these placeholders. Please fill them to finalize the draft.</p>
                   </div>
                   <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                       {sellerFields.map((field, i) => (
                           <div key={i}>
                               <label className="block text-xs font-bold text-cyber-primary mb-1 uppercase tracking-wider">{field}</label>
                               <input 
                                   className="w-full bg-cyber-black border border-cyber-border rounded p-3 text-white text-sm focus:border-cyber-primary outline-none transition-all" 
                                   value={sellerInputValues[field] || ''} 
                                   onChange={(e) => setSellerInputValues({...sellerInputValues, [field]: e.target.value})} 
                                   placeholder={`Enter ${field}`} 
                               />
                           </div>
                       ))}
                   </div>
                   <div className="p-6 border-t border-cyber-border bg-cyber-black/50 rounded-b-xl flex justify-end gap-3">
                       <button onClick={() => setShowSellerInputModal(false)} className="px-4 py-2 text-cyber-dim hover:text-white text-sm">Cancel</button>
                       <button onClick={handleFinalizeSellerTemplate} disabled={isProcessing} className="px-6 py-2 bg-cyber-primary text-black font-bold rounded hover:bg-white transition-all shadow-neon-blue text-sm uppercase flex items-center gap-2">
                           {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>} 
                           Apply & Finalize
                       </button>
                   </div>
               </div>
           </div>
       )}

       {/* Add/Edit Vehicle Modal */}
       {showAddModal && (
           <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-4xl rounded-xl border border-cyber-primary shadow-neon-blue flex flex-col max-h-[90vh]">
                   <div className="p-6 border-b border-cyber-border bg-cyber-dark flex justify-between items-center rounded-t-xl">
                       <h3 className="text-xl font-bold text-white"><i className="fas fa-car mr-2 text-cyber-primary"></i> {editingVehicleId ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
                       <button onClick={() => setShowAddModal(false)} className="text-cyber-dim hover:text-white"><i className="fas fa-times text-xl"></i></button>
                   </div>
                   <div className="p-8 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                           <h4 className="text-cyber-primary font-bold border-b border-cyber-border pb-2 mb-4">Basic Info</h4>
                           <div><label className="text-xs text-cyber-dim">Model Name</label><input className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.name} onChange={e => setVehicleForm({...vehicleForm, name: e.target.value})} /></div>
                           <div className="grid grid-cols-2 gap-4">
                               <div><label className="text-xs text-cyber-dim">Trim</label><input className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.trim} onChange={e => setVehicleForm({...vehicleForm, trim: e.target.value})} /></div>
                               <div><label className="text-xs text-cyber-dim">Price (INR)</label><input type="number" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.price} onChange={e => setVehicleForm({...vehicleForm, price: e.target.value})} /></div>
                           </div>
                           <div className="grid grid-cols-3 gap-4">
                               <div><label className="text-xs text-cyber-dim">Drive</label><select className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.drive} onChange={e => setVehicleForm({...vehicleForm, drive: e.target.value})}><option>FWD</option><option>RWD</option><option>AWD</option><option>4WD</option></select></div>
                               <div><label className="text-xs text-cyber-dim">Seats</label><input type="number" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.seats} onChange={e => setVehicleForm({...vehicleForm, seats: Number(e.target.value)})} /></div>
                               <div><label className="text-xs text-cyber-dim">Region</label><select className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.region} onChange={e => setVehicleForm({...vehicleForm, region: e.target.value})}><option>Delhi NCR</option><option>Maharashtra</option><option>Karnataka</option><option>General</option></select></div>
                           </div>
                           <div><label className="text-xs text-cyber-dim">Image URL</label><input className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white" value={vehicleForm.imageUrl} onChange={e => setVehicleForm({...vehicleForm, imageUrl: e.target.value})} /></div>
                           <div><label className="text-xs text-cyber-dim">Visual Description</label><textarea className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white h-20" value={vehicleForm.visualDesc} onChange={e => setVehicleForm({...vehicleForm, visualDesc: e.target.value})} placeholder="For visualizer..." /></div>
                       </div>
                       
                       <div className="space-y-4">
                           <h4 className="text-cyber-primary font-bold border-b border-cyber-border pb-2 mb-4">Insurance Configuration</h4>
                           <div className="bg-cyber-black/50 p-4 rounded border border-cyber-border">
                               <div className="grid grid-cols-2 gap-2 mb-2">
                                   <input placeholder="Provider (e.g. HDFC)" className="bg-cyber-dark border border-cyber-border rounded p-2 text-xs text-white" value={newPlan.provider || ''} onChange={e => setNewPlan({...newPlan, provider: e.target.value})} />
                                   <input placeholder="Plan Name" className="bg-cyber-dark border border-cyber-border rounded p-2 text-xs text-white" value={newPlan.name || ''} onChange={e => setNewPlan({...newPlan, name: e.target.value})} />
                               </div>
                               <div className="grid grid-cols-2 gap-2 mb-2">
                                   <input type="number" placeholder="Premium (₹)" className="bg-cyber-dark border border-cyber-border rounded p-2 text-xs text-white" value={newPlan.premium || ''} onChange={e => setNewPlan({...newPlan, premium: Number(e.target.value)})} />
                                   <select className="bg-cyber-dark border border-cyber-border rounded p-2 text-xs text-white" value={newPlan.type} onChange={e => setNewPlan({...newPlan, type: e.target.value as any})}><option>Comprehensive</option><option>Zero-Dep</option><option>Third-Party</option><option>Pay-As-You-Drive</option></select>
                               </div>
                               <input placeholder="Add-ons (comma separated)" className="w-full bg-cyber-dark border border-cyber-border rounded p-2 text-xs text-white mb-2" value={(newPlan.addons as any) || ''} onChange={e => setNewPlan({...newPlan, addons: e.target.value as any})} />
                               <button onClick={handleAddInsurancePlan} type="button" className="w-full bg-cyber-primary/20 text-cyber-primary border border-cyber-primary hover:bg-cyber-primary hover:text-black py-1 rounded text-xs font-bold uppercase">Add Plan</button>
                           </div>
                           <div className="max-h-40 overflow-y-auto space-y-2">
                               {vehicleForm.insurancePlans.map(p => (
                                   <div key={p.id} className="flex justify-between items-center bg-cyber-dark p-2 rounded border border-cyber-border text-xs">
                                       <div>
                                           <div className="font-bold text-white">{p.provider} - {p.name}</div>
                                           <div className="text-cyber-dim">₹{p.premium} | {p.type}</div>
                                       </div>
                                       <button onClick={() => handleRemovePlan(p.id)} className="text-red-500 hover:text-white"><i className="fas fa-trash"></i></button>
                                   </div>
                               ))}
                           </div>
                       </div>

                       <div className="col-span-1 md:col-span-2 space-y-4">
                           <div className="flex justify-between items-center border-b border-cyber-border pb-2 mb-2">
                               <h4 className="text-cyber-primary font-bold">Contract Template</h4>
                               <div className="flex gap-2">
                                   <button type="button" onClick={handleGenerateTemplate} disabled={isGeneratingTemplate} className="text-xs bg-cyber-secondary/20 text-cyber-secondary border border-cyber-secondary px-3 py-1 rounded hover:bg-cyber-secondary hover:text-white transition-all flex items-center gap-2">
                                       {isGeneratingTemplate ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} 
                                       {isGeneratingTemplate ? 'Generating...' : 'AI Generate'}
                                   </button>
                               </div>
                           </div>
                           
                           {/* Stylized 'Paper' Editor for Seller Template */}
                           <div className="bg-gray-100 p-4 rounded border border-cyber-border h-96 overflow-hidden flex flex-col relative">
                               <div className="absolute top-0 right-0 bg-gray-200 text-gray-500 text-[10px] px-2 py-1 rounded-bl border-b border-l border-gray-300 z-10 font-bold uppercase tracking-wider">Editor Mode</div>
                               <div className="bg-white text-black shadow-lg w-full flex-1 p-8 rounded-sm text-sm leading-7 font-serif border border-gray-200 overflow-y-auto">
                                    <div
                                       ref={templateEditorRef}
                                       contentEditable
                                       suppressContentEditableWarning={true}
                                       className="w-full min-h-full outline-none [&>p]:mb-4 [&>h3]:text-xl [&>h3]:font-bold [&>h3]:mb-4 [&>h3]:mt-6 [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-1 [&>strong]:font-semibold"
                                       dangerouslySetInnerHTML={{ __html: vehicleForm.contractTemplate }}
                                       onBlur={(e) => setVehicleForm({...vehicleForm, contractTemplate: e.currentTarget.innerHTML})}
                                    />
                               </div>
                           </div>

                           <form onSubmit={handleContractCopilotSubmit} className="flex gap-2">
                               <input className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-xs text-white" placeholder="AI Copilot: e.g., 'Add a clause about 20% downpayment'" value={contractCopilotQuery} onChange={e => setContractCopilotQuery(e.target.value)} disabled={isCopilotThinking} />
                               <button type="button" onClick={handleContractCopilotSubmit} disabled={isCopilotThinking} className="text-cyber-primary hover:text-white px-3 border border-cyber-border rounded hover:border-cyber-primary"><i className="fas fa-robot"></i></button>
                           </form>
                       </div>
                   </div>
                   <div className="p-6 border-t border-cyber-border bg-cyber-black/50 rounded-b-xl flex justify-end gap-4">
                       <button onClick={() => setShowAddModal(false)} className="px-6 py-2 text-cyber-dim hover:text-white">Cancel</button>
                       <button onClick={handleSaveVehicle} disabled={isProcessing} className="px-8 py-2 bg-cyber-primary text-black font-bold rounded hover:bg-white transition-all shadow-neon-blue">{isProcessing ? <i className="fas fa-spinner fa-spin"></i> : (editingVehicleId ? 'Update Vehicle' : 'Save Vehicle')}</button>
                   </div>
               </div>
           </div>
       )}
       {/* ... (rest of the file remains unchanged) */}
       {/* View Buyer Profile Modal */}
       {viewingBuyer && (
           <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-md rounded-xl border border-cyber-secondary shadow-neon-purple flex flex-col animate-scale-in">
                   <div className="p-4 border-b border-cyber-border bg-cyber-dark flex justify-between items-center rounded-t-xl">
                       <h3 className="text-lg font-bold text-white"><i className="fas fa-user mr-2 text-cyber-secondary"></i> Buyer Details</h3>
                       <button onClick={() => setViewingBuyer(null)} className="text-cyber-dim hover:text-white"><i className="fas fa-times"></i></button>
                   </div>
                   <div className="p-6 space-y-6">
                       <div className="flex items-center gap-4">
                           <div className="w-16 h-16 rounded-full bg-cyber-secondary/20 flex items-center justify-center border border-cyber-secondary text-cyber-secondary text-2xl font-bold">
                               {viewingBuyer.name.charAt(0)}
                           </div>
                           <div>
                               <h2 className="text-xl font-bold text-white">{viewingBuyer.name}</h2>
                               <p className="text-cyber-dim text-sm">{viewingBuyer.email}</p>
                           </div>
                       </div>
                       <div className="space-y-3">
                           <div className="bg-cyber-black p-3 rounded border border-cyber-border">
                               <p className="text-xs text-cyber-dim uppercase font-bold mb-1">Phone</p>
                               <p className="text-white">{viewingBuyer.phone || 'N/A'}</p>
                           </div>
                           <div className="bg-cyber-black p-3 rounded border border-cyber-border">
                               <p className="text-xs text-cyber-dim uppercase font-bold mb-1">Address</p>
                               <p className="text-white">{viewingBuyer.address || 'N/A'}</p>
                           </div>
                           <div className="bg-cyber-black p-3 rounded border border-cyber-border">
                               <p className="text-xs text-cyber-dim uppercase font-bold mb-1">Interests</p>
                               <div className="flex flex-wrap gap-2 mt-1">
                                   {viewingBuyer.interests ? viewingBuyer.interests.split(',').map((tag, i) => (
                                       <span key={i} className="px-2 py-1 bg-cyber-secondary/10 text-cyber-secondary rounded text-xs border border-cyber-secondary/30">{tag.trim()}</span>
                                   )) : <span className="text-cyber-dim italic">None listed</span>}
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
           </div>
       )}

      {/* Contract Revision / View Modal */}
      {showContractModal && selectedContract && (
          <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
              <div className="glass-panel w-full max-w-[90vw] h-[95vh] rounded-xl border border-cyber-secondary shadow-neon-purple flex flex-col animate-scale-in">
                  <div className="p-4 border-b border-cyber-border bg-cyber-dark flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <i className={`fas ${selectedContract.status === 'accepted' ? 'fa-check-circle text-green-500' : 'fa-edit text-orange-500'} text-xl`}></i>
                          <div>
                              <h3 className="text-lg font-bold text-white">
                                  {selectedContract.status === 'accepted' ? 'Signed Contract Record' : 'Revise Contract Workflow'}
                              </h3>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-cyber-dim">{selectedContract.vehicleName} - {selectedContract.id}</p>
                                <button onClick={() => handleViewBuyerProfile(selectedContract.userId)} className="text-[10px] bg-cyber-secondary/20 text-cyber-secondary px-2 py-0.5 rounded border border-cyber-secondary/50 hover:bg-cyber-secondary hover:text-white transition-all"><i className="fas fa-user-eye"></i> View Buyer</button>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => setShowContractModal(false)} className="text-cyber-dim hover:text-white"><i className="fas fa-times text-xl"></i></button>
                  </div>
                  
                  {/* Revision Split View */}
                  <div className="flex-1 flex overflow-hidden">
                      {/* Left: Editor (Endless Page Format) */}
                      <div className={`flex-1 flex flex-col border-r border-cyber-border w-2/3 bg-gray-100`}>
                          {selectedContract.status === 'needs_changes' && (
                              <div className="bg-orange-500/10 border-b border-orange-500/30 p-4 sticky top-0 z-10 backdrop-blur-md">
                                  <h4 className="text-orange-600 font-bold text-sm mb-1"><i className="fas fa-exclamation-triangle mr-2"></i> Buyer Request:</h4>
                                  <p className="text-orange-800 text-sm italic">"{selectedContract.change_request_message}"</p>
                              </div>
                          )}
                          <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                              {/* Endless White Sheet */}
                              <div className="bg-white text-black shadow-lg mx-auto w-full max-w-4xl min-h-screen h-auto p-12 lg:p-16 rounded-sm text-sm leading-7 font-serif border border-gray-200">
                                  <div className="[&>p]:mb-4 [&>h3]:text-xl [&>h3]:font-bold [&>h3]:mb-4 [&>h3]:mt-6 [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-1 [&>strong]:font-semibold">
                                      {selectedContract.status === 'accepted' ? (
                                          <div dangerouslySetInnerHTML={{ __html: selectedContract.contract_html }} />
                                      ) : (
                                          <div 
                                              ref={revisionEditorRef}
                                              contentEditable
                                              suppressContentEditableWarning={true}
                                              className="w-full h-full outline-none focus:bg-gray-50 transition-colors rounded px-2 -mx-2"
                                              dangerouslySetInnerHTML={{ __html: revisionHtml }}
                                          />
                                      )}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Right: AI Assistant & Negotiation */}
                      <div className="w-1/3 bg-cyber-dark flex flex-col border-l border-cyber-border">
                          
                          {/* NEW: Buyer Inquiries Section */}
                          <div className="p-3 border-b border-cyber-border bg-cyber-black/50 flex items-center justify-between">
                              <h4 className="text-white font-bold text-sm"><i className="fas fa-question-circle mr-2 text-yellow-400"></i> Buyer Inquiries</h4>
                              <span className="text-[10px] text-cyber-dim">Analysis Phase</span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-cyber-black/30 border-b border-cyber-border max-h-60">
                              {queries.filter(q => q.vehicleId === selectedContract.vehicleId && q.userId === selectedContract.userId && q.message.includes('[Analysis Phase Question]')).length > 0 ? (
                                  queries.filter(q => q.vehicleId === selectedContract.vehicleId && q.userId === selectedContract.userId && q.message.includes('[Analysis Phase Question]')).map(q => (
                                      <div key={q.id} className="bg-cyber-dark p-3 rounded border border-cyber-border text-xs">
                                          <p className="text-cyber-dim italic mb-2">"{q.message.replace('[Analysis Phase Question]: ', '')}"</p>
                                          {q.reply ? (
                                              <p className="text-green-400 font-bold"><i className="fas fa-check mr-1"></i> Replied: {q.reply}</p>
                                          ) : (
                                              <div className="flex gap-2">
                                                  <input 
                                                      className="flex-1 bg-cyber-black border border-cyber-border rounded px-2 py-1 text-white text-[10px] focus:border-yellow-400 outline-none" 
                                                      placeholder="Reply..." 
                                                      value={replyText[q.id] || ''} 
                                                      onChange={(e) => setReplyText({...replyText, [q.id]: e.target.value})} 
                                                  />
                                                  <button onClick={() => handleReplySubmit(q.id)} className="bg-yellow-400 text-black px-2 py-1 rounded text-[10px] font-bold hover:bg-white">Send</button>
                                              </div>
                                          )}
                                      </div>
                                  ))
                              ) : (
                                  <p className="text-xs text-cyber-dim italic text-center py-4">No analysis questions from buyer.</p>
                              )}
                          </div>

                          {/* AI Assistant Section */}
                          <div className="p-3 border-b border-cyber-border bg-cyber-black/50">
                              <h4 className="text-cyber-secondary font-bold text-sm"><i className="fas fa-magic mr-2"></i> Revision Copilot</h4>
                          </div>
                          <div className="flex-1 p-4 overflow-y-auto text-xs text-cyber-dim space-y-4 border-b border-cyber-border min-h-32">
                              <p>I can help you modify the contract clauses.</p>
                              <div className="bg-cyber-black p-3 rounded border border-cyber-border">
                                  <p className="mb-2 font-bold text-white">Suggested Prompt:</p>
                                  <p className="italic">"Modify the warranty clause to extend coverage to 24 months as requested."</p>
                              </div>
                              {isRevisionThinking && <div className="text-cyber-primary animate-pulse">Processing changes...</div>}
                          </div>
                          <form onSubmit={handleRevisionCopilotSubmit} className="p-3 border-b border-cyber-border bg-cyber-black">
                              <div className="flex gap-2">
                                  <input 
                                      className="flex-1 bg-cyber-dark border border-cyber-border rounded px-3 py-2 text-xs text-white focus:border-cyber-secondary outline-none" 
                                      placeholder="AI Instruction..." 
                                      value={revisionCopilotQuery}
                                      onChange={e => setRevisionCopilotQuery(e.target.value)}
                                  />
                                  <button type="submit" disabled={isRevisionThinking} className="text-cyber-secondary hover:text-white"><i className="fas fa-paper-plane"></i></button>
                              </div>
                          </form>

                          {/* Negotiation / Note Section */}
                          <div className="p-3 border-b border-cyber-border bg-cyber-black/50 mt-auto">
                              <h4 className="text-white font-bold text-sm"><i className="fas fa-comment-dots mr-2 text-yellow-400"></i> Negotiation / Note</h4>
                          </div>
                          <div className="p-4 bg-cyber-black h-32">
                              <textarea 
                                  className="w-full h-full bg-cyber-dark border border-cyber-border rounded p-3 text-xs text-white resize-none focus:border-white outline-none"
                                  placeholder="Message to buyer (e.g. 'We can only extend warranty by 6 months, not 12. Updated accordingly.')"
                                  value={sellerNote}
                                  onChange={(e) => setSellerNote(e.target.value)}
                              />
                          </div>
                      </div>
                  </div>

                  <div className="p-4 border-t border-cyber-border bg-cyber-dark flex justify-end gap-3">
                      <button onClick={() => setShowContractModal(false)} className="px-4 py-2 text-cyber-dim hover:text-white text-sm">Close</button>
                      {selectedContract.status === 'needs_changes' || selectedContract.status === 'pending' ? (
                          <>
                              <button 
                                  onClick={() => handleUpdateContract(true)}
                                  disabled={isUpdatingContract}
                                  className="px-4 py-2 bg-yellow-600/20 border border-yellow-600 text-yellow-500 font-bold rounded hover:bg-yellow-600 hover:text-black transition-all text-sm uppercase flex items-center gap-2"
                              >
                                  {isUpdatingContract ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-reply"></i>}
                                  Send with Note
                              </button>
                              <button 
                                  onClick={() => handleUpdateContract(false)}
                                  disabled={isUpdatingContract}
                                  className="px-6 py-2 bg-cyber-secondary text-white font-bold rounded hover:bg-white hover:text-black transition-all shadow-neon-purple text-sm uppercase flex items-center gap-2"
                              >
                                  {isUpdatingContract ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-double"></i>}
                                  Verify & Send Revision
                              </button>
                          </>
                      ) : null}
                  </div>
              </div>
          </div>
      )}
      
      {/* Header */}
      <header className="glass-panel border-b border-cyber-border h-16 flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
            <div onClick={() => setActiveTab('overview')} className="relative group cursor-pointer hover:shadow-neon-blue rounded-lg transition-all duration-300">
                <div className="bg-cyber-dark px-3 py-1 rounded-lg border border-cyber-border flex items-center gap-2">
                    <i className="fas fa-cube text-cyber-primary group-hover:animate-pulse"></i>
                    <span className="font-bold tracking-wide text-white">Teckion<span className="text-cyber-primary">.Seller</span></span>
                </div>
            </div>
        </div>
        <nav className="flex items-center gap-4">
            <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded text-sm transition-all ${activeTab==='overview' ? 'bg-cyber-primary/20 text-white' : 'text-cyber-dim'}`}>Overview</button>
            <button onClick={() => setActiveTab('vehicles')} className={`px-4 py-2 rounded text-sm transition-all ${activeTab==='vehicles' ? 'bg-cyber-primary/20 text-white' : 'text-cyber-dim'}`}>Inventory</button>
            <button onClick={() => setActiveTab('interactions')} className={`px-4 py-2 rounded text-sm transition-all ${activeTab==='interactions' ? 'bg-cyber-primary/20 text-white' : 'text-cyber-dim'}`}>CRM</button>
        </nav>
        <div className="flex items-center gap-4">
             <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-2 px-3 py-1 rounded bg-cyber-primary/10 border border-cyber-primary hover:bg-cyber-primary/20 transition-all text-cyber-primary text-xs font-bold uppercase tracking-wider">
                 <i className="fas fa-id-card"></i> Profile
             </button>
             <button onClick={onLogout} className="text-cyber-dim hover:text-cyber-accent ml-4"><i className="fas fa-sign-out-alt"></i></button>
        </div>
      </header>
      {/* ... rest of the file ... */}
      <main className="flex-1 p-6 relative z-10">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in-up">
             {/* ... (Metrics Cards & Charts remain same) ... */}
             {[
               { l: 'Total Visits', v: analytics?.total_visits || 0, c: 'text-cyber-primary', i: 'fa-eye' },
               { l: 'Pending Contracts', v: calculatedMetrics.pending, c: 'text-yellow-400', i: 'fa-file-signature' },
               { l: 'Est. Revenue', v: `₹${(calculatedMetrics.revenue / 10000000).toFixed(2)} Cr`, c: 'text-green-400', i: 'fa-rupee-sign' },
               { l: 'Conversion Rate', v: `${calculatedMetrics.conversionRate}%`, c: 'text-cyber-accent', i: 'fa-percent' }
             ].map((s, i) => (
               <div key={i} className="glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all duration-300 transform hover:-translate-y-1">
                 <div className="flex justify-between items-center">
                   <div>
                     <p className="text-cyber-dim text-xs uppercase font-bold tracking-widest">{s.l}</p>
                     <h3 className="text-3xl font-bold text-white mt-2">{s.v}</h3>
                   </div>
                   <div className={`p-4 rounded-full bg-cyber-dark/80 border border-cyber-border ${s.c} shadow-lg shadow-${s.c}/10`}><i className={`fas ${s.i} text-xl`}></i></div>
                 </div>
               </div>
             ))}

             {/* Charts */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-chart-line text-green-400"></i> Revenue Projection</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={extendedChartData.revenueTrend}>
                            <defs>
                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                            <XAxis dataKey="name" stroke="#858595" />
                            <YAxis stroke="#858595" />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35', color: '#fff'}} />
                            <Area type="monotone" dataKey="revenue" stroke="#22c55e" fillOpacity={1} fill="url(#colorRev)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
             </div>
             
             {/* ... All other charts remain as is ... */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-bullseye text-cyber-primary"></i> Market Demand Radar</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={extendedChartData.topUsage}>
                            <PolarGrid stroke="#2a2a35" />
                            <PolarAngleAxis dataKey="subject" stroke="#fff" tick={{ fontSize: 10 }} />
                            <PolarRadiusAxis stroke="#858595" angle={30} domain={[0, 'auto']} />
                            <Radar name="Demand" dataKey="A" stroke="#00f0ff" fill="#00f0ff" fillOpacity={0.4} />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
             </div>
             
             {/* Budget Chart */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-wallet text-cyber-secondary"></i> Budget Trend Analysis</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={extendedChartData.budgetTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                            <XAxis dataKey="date" stroke="#858595" />
                            <YAxis stroke="#858595" />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                            <Line type="monotone" dataKey="avgBudget" stroke="#7000ff" strokeWidth={2} dot={{r: 4}} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Car Type Chart */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-car-side text-cyber-accent"></i> Vehicle Category Interest</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={extendedChartData.carTypeTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                            <XAxis dataKey="name" stroke="#858595" />
                            <YAxis stroke="#858595" />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                            <Legend />
                            <Line type="monotone" dataKey="SUV" stroke="#00f0ff" strokeWidth={2} />
                            <Line type="monotone" dataKey="Sedan" stroke="#ff003c" strokeWidth={2} />
                            <Line type="monotone" dataKey="EV" stroke="#22c55e" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Terrain Chart */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-mountain text-yellow-400"></i> Terrain Preference Shift</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={extendedChartData.terrainTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                            <XAxis dataKey="name" stroke="#858595" />
                            <YAxis stroke="#858595" />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                            <Legend />
                            <Line type="monotone" dataKey="City" stroke="#eab308" strokeWidth={2} />
                            <Line type="monotone" dataKey="OffRoad" stroke="#8b5cf6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Inventory Age */}
             <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-hourglass-half text-white"></i> Inventory Age Analysis</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={extendedChartData.inventoryAge} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                            <XAxis type="number" stroke="#858595" />
                            <YAxis dataKey="name" type="category" width={80} stroke="#858595" />
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Status Pie */}
             <div className="col-span-1 md:col-span-4 glass-panel p-6 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-chart-pie text-cyber-accent"></i> Deal Status Overview</h3>
                <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={extendedChartData.statusData} 
                                cx="50%" cy="50%" 
                                innerRadius={60} 
                                outerRadius={80} 
                                paddingAngle={5} 
                                dataKey="value"
                            >
                                {extendedChartData.statusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#2a2a35'}} />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
             </div>
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'vehicles' && (
           <div className="relative z-10 animate-fade-in-up">
                 <div className="flex justify-between items-center mb-6 bg-cyber-dark p-4 rounded-lg border border-cyber-border">
                     <h2 className="text-xl font-bold text-white"><i className="fas fa-car mr-2"></i> Inventory</h2>
                     <select 
                        value={filterVehicle} 
                        onChange={(e) => setFilterVehicle(e.target.value)}
                        className="bg-cyber-black border border-cyber-border rounded px-3 py-1 text-sm text-white focus:border-cyber-primary outline-none"
                     >
                         <option value="All">All Drives</option>
                         <option value="FWD">FWD</option>
                         <option value="RWD">RWD</option>
                         <option value="AWD">AWD</option>
                         <option value="4WD">4WD</option>
                     </select>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {filteredVehicles.map(v => (
                        <div key={v.id} className="glass-panel rounded-xl overflow-hidden border border-cyber-border hover:border-cyber-primary hover:shadow-neon-blue transition-all duration-300 group relative">
                           <div className="h-48 relative overflow-hidden bg-cyber-dark">
                              <img src={v.image_url} alt={v.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform duration-500" />
                              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-cyber-primary border border-cyber-primary/30">{v.drive}</div>
                           </div>
                           <div className="p-4">
                              <h3 className="text-lg font-bold text-white group-hover:text-cyber-primary transition-colors">{v.name}</h3>
                              <p className="text-cyber-dim text-sm">{v.trim}</p>
                              <div className="flex justify-between items-end mt-4 pt-4 border-t border-cyber-border">
                                 <div className="flex flex-col">
                                    <span className="text-xl font-bold text-white">₹{(v.price_range[0]/100000).toFixed(2)}L</span>
                                    <span className="text-xs text-cyber-dim">{v.seats} Seats</span>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => openEditModal(v)} className="text-sm text-cyber-dim hover:text-white hover:underline flex items-center gap-1"><i className="fas fa-edit"></i></button>
                                     <button 
                                        onClick={(e) => handleDelete(e, 'vehicles', v.id)} 
                                        className="text-sm text-red-500 hover:text-red-400 flex items-center gap-1 z-20"
                                        disabled={deletingIds.has(v.id)}
                                     >
                                        {deletingIds.has(v.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                     </button>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                     
                     <div className="flex flex-col gap-4">
                         <button onClick={openAddModal} className="glass-panel border-dashed border-2 border-cyber-dim rounded-xl flex items-center justify-center text-cyber-dim hover:text-cyber-primary hover:border-cyber-primary transition-all p-8 flex-col gap-2 h-40">
                             <i className="fas fa-plus text-3xl"></i><span>Add Vehicle</span>
                         </button>
                         
                         <button onClick={handleSeed} disabled={isProcessing} className="glass-panel border border-cyber-primary/30 bg-cyber-primary/5 rounded-xl flex items-center justify-center text-cyber-primary hover:bg-cyber-primary hover:text-black transition-all p-8 flex-col gap-2 h-40">
                            {isProcessing ? <i className="fas fa-spinner fa-spin text-3xl"></i> : <i className="fas fa-database text-3xl"></i>}
                            <span>{isProcessing ? 'Populating...' : 'Initialize Inventory (Add 10 Cars)'}</span>
                         </button>
                     </div>
                 </div>
           </div>
         )}

         {/* CRM Logic */}
         {activeTab === 'interactions' && (
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up">
                {/* Contracts Column */}
                <div className="glass-panel rounded-xl border border-cyber-border p-6 h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-file-contract text-cyber-secondary"></i> Contracts</h3>
                        <select 
                            value={filterContractStatus} 
                            onChange={(e) => setFilterContractStatus(e.target.value)}
                            className="bg-cyber-black border border-cyber-border rounded px-2 py-1 text-xs text-white focus:border-cyber-secondary outline-none"
                        >
                            <option value="All">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="needs_changes">Needs Changes</option>
                            <option value="accepted">Accepted</option>
                        </select>
                    </div>
                    <div className="space-y-4">
                        {filteredContracts.map(c => (
                            <div key={c.id} className="bg-cyber-dark p-4 rounded-lg border border-cyber-border hover:border-cyber-secondary transition-all relative group">
                                <button 
                                    onClick={(e) => handleDelete(e, 'contracts', c.id)} 
                                    className="absolute top-2 right-2 text-cyber-dim hover:text-red-500 z-20 p-2"
                                    disabled={deletingIds.has(c.id)}
                                >
                                    {deletingIds.has(c.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                </button>
                                <div className="flex justify-between items-start mb-2 pr-6">
                                    <h4 className="font-bold text-white">{c.vehicleName}</h4>
                                    <span className={`text-[10px] px-2 py-1 rounded uppercase font-bold 
                                        ${c.status === 'accepted' ? 'bg-green-500/20 text-green-500' : 
                                          c.status === 'needs_changes' ? 'bg-orange-500/20 text-orange-500' :
                                          'bg-yellow-500/20 text-yellow-500'}`}>
                                        {c.status.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-xs text-cyber-dim">Client ID: {c.userId}</p>
                                    <button onClick={() => handleViewBuyerProfile(c.userId)} className="text-[10px] bg-cyber-primary/10 text-cyber-primary px-2 py-0.5 rounded border border-cyber-primary/30 hover:bg-cyber-primary/30 transition-all"><i className="fas fa-user"></i> View Profile</button>
                                </div>
                                <p className="text-xs text-cyber-dim">Date: {c.created_at}</p>
                                <div className="mt-2 text-xs text-white bg-black/30 p-2 rounded mb-2">
                                    Summary: {c.contract_summary}
                                </div>
                                
                                <div className="flex gap-2 mt-2">
                                    {c.status === 'pending' && (
                                        <button 
                                            id={`reminder-${c.id}`}
                                            onClick={() => handleSendReminder(c.id)}
                                            className="flex-1 text-xs py-2 rounded bg-cyber-secondary/20 text-cyber-secondary border border-cyber-secondary hover:bg-cyber-secondary hover:text-white transition-all font-bold flex justify-center items-center gap-2"
                                        >
                                            <i className="fas fa-bell"></i> Remind
                                        </button>
                                    )}
                                    
                                    {(c.status === 'accepted' || c.status === 'needs_changes') && (
                                        <button 
                                            onClick={() => openContractModal(c)}
                                            className={`flex-1 text-xs py-2 rounded border transition-all font-bold flex justify-center items-center gap-2
                                                ${c.status === 'accepted' ? 'bg-green-900/20 border-green-500 text-green-500 hover:bg-green-500 hover:text-black' : 'bg-orange-900/20 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black'}`}
                                        >
                                            {c.status === 'accepted' ? <><i className="fas fa-file-contract"></i> View Signed</> : <><i className="fas fa-edit"></i> Revise</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Queries Column */}
                <div className="glass-panel rounded-xl border border-cyber-border p-6 h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-comments text-cyber-primary"></i> Customer Queries</h3>
                        <select 
                            value={filterQueryStatus} 
                            onChange={(e) => setFilterQueryStatus(e.target.value)}
                            className="bg-cyber-black border border-cyber-border rounded px-2 py-1 text-xs text-white focus:border-cyber-primary outline-none"
                        >
                            <option value="All">All Queries</option>
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                    <div className="space-y-4">
                        {filteredQueries.map(q => {
                            const isProposal = q.message.startsWith('[PROPOSAL]');
                            return (
                                <div key={q.id} className={`p-4 rounded-lg border transition-all relative group ${isProposal ? 'bg-yellow-900/10 border-yellow-600/50' : 'bg-cyber-dark border-cyber-border hover:border-cyber-primary'}`}>
                                    <button 
                                        onClick={(e) => handleDelete(e, 'queries', q.id)} 
                                        className="absolute top-2 right-2 text-cyber-dim hover:text-red-500 z-20 p-2"
                                        disabled={deletingIds.has(q.id)}
                                    >
                                        {deletingIds.has(q.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                    </button>
                                    <div className="flex justify-between items-start mb-2 pr-6">
                                        <div>
                                            <h4 className="font-bold text-white text-sm">{q.vehicleName}</h4>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] text-cyber-primary font-mono">{q.userName || 'Anonymous'}</p>
                                                <button onClick={() => handleViewBuyerProfile(q.userId)} className="text-[9px] text-cyber-dim hover:text-white underline"><i className="fas fa-user"></i> View Profile</button>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-1 rounded uppercase font-bold ${q.status === 'open' ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-500'}`}>{q.status}</span>
                                    </div>
                                    <div className={`p-3 rounded mb-3 text-sm italic border-l-2 ${isProposal ? 'bg-yellow-400/10 text-yellow-200 border-yellow-400 font-bold' : 'bg-cyber-primary/10 text-cyber-text border-cyber-primary'}`}>
                                        "{q.message}"
                                    </div>
                                    {q.status === 'open' ? (
                                        <div className="flex gap-2">
                                            <input 
                                                className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-1 text-xs text-white focus:border-cyber-primary outline-none" 
                                                placeholder="Type a reply..." 
                                                value={replyText[q.id] || ''}
                                                onChange={(e) => setReplyText({...replyText, [q.id]: e.target.value})}
                                            />
                                            <button 
                                                onClick={() => handleReplySubmit(q.id)}
                                                className="bg-cyber-primary text-black px-3 rounded text-xs font-bold hover:bg-white transition-colors"
                                            >
                                                Reply
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-cyber-dim">
                                            <span className="text-cyber-secondary font-bold">You replied:</span> {q.reply}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
         )}
      </main>
      {/* ... (Chatbot & Modals logic reused) ... */}
    </div>
  );
};

export default SellerDashboard;
