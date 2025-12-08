
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, Vehicle, SavedVisual, Contract, UserQuery, BlockchainReceipt, InsurancePlan } from '../types';
import { analyzeIntent, buildContract, highlightClauses, generateVehicleVisuals, queryContractAssistant, extractContractVariables, adaptContractToJurisdiction, analyzeInsuranceNeeds, queryInsuranceAgent } from '../services/geminiService';
import { fetchVehicles, updateAnalytics, saveContract, updateContractStatus, saveUserQuery, saveVisual, fetchUserActivity, deleteDocument, updateUserProfile } from '../services/firebase';
import { signContractOnChain } from '../services/blockchainService';
import { DotScreenShader } from './ui/dot-shader-background';
import { ParticleTextEffect } from './ui/particle-text-effect';

interface UserDashboardProps {
  user: User;
  useMockData: boolean;
  onLogout: () => void;
}

// Helper to compress image before saving to avoid Firestore 1MB limit
const compressImage = (base64Str: string, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Compress to JPEG at 0.7 quality
          resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => {
        console.warn("Image compression failed, using original.");
        resolve(base64Str);
    };
  });
};

const UserDashboard: React.FC<UserDashboardProps> = ({ user, useMockData, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'garage' | 'notifications'>('home');
  const [step, setStep] = useState<'questionnaire' | 'matches' | 'visualizer' | 'contract' | 'review' | 'receipt'>('questionnaire');
  
  // Profile State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
      name: user.name,
      phone: user.phone || '',
      address: user.address || '',
      interests: user.interests || ''
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Questionnaire State
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '', '']); // Added 4th slot
  const [finalPrompt, setFinalPrompt] = useState('');
  
  const QUESTIONS = [
      { q: "Who will be riding? Any pets?", sub: "e.g., 2 adults, 3 kids, and a large dog", icon: "fa-users" },
      { q: "What terrain will you drive on?", sub: "e.g., City traffic, Highway, Muddy trails, Snow", icon: "fa-mountain" },
      { q: "What is the primary use?", sub: "e.g., Daily commute, Weekend camping, Luxury transport", icon: "fa-route" },
      { q: "What is your budget?", sub: "e.g., 15 Lakh, 50 Lakh, 1 Cr, or No Limit", icon: "fa-wallet" }
  ];

  const [loading, setLoading] = useState(false);
  const [intentResult, setIntentResult] = useState<any>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedVehicleBase64, setSelectedVehicleBase64] = useState<string | null>(null);
  
  // Visualizer State
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [visualizing, setVisualizing] = useState(false);
  const [savedImageIds, setSavedImageIds] = useState<Set<string>>(new Set());
  const [isSavingImg, setIsSavingImg] = useState(false);
  
  // Visualizer Chat State
  const [visChatQuery, setVisChatQuery] = useState('');
  const [visChatHistory, setVisChatHistory] = useState<{text: string, type: 'user'|'system'}[]>([]);
  const visChatEndRef = useRef<HTMLDivElement>(null);

  // Contract State
  const [contractData, setContractData] = useState<{contract_html: string, summary: string, seller_note?: string} | null>(null);
  const [currentContractId, setCurrentContractId] = useState<string | null>(null);
  const [editableContractText, setEditableContractText] = useState('');
  const [contractRegion, setContractRegion] = useState('Delhi NCR');
  const [isAdaptingContract, setIsAdaptingContract] = useState(false);
  
  // Contract Input Flow State
  const [showContractInputModal, setShowContractInputModal] = useState(false);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [contractInputValues, setContractInputValues] = useState<Record<string, string>>({});

  const [contractChatQuery, setContractChatQuery] = useState('');
  const [contractChatHistory, setContractChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [isContractChatThinking, setIsContractChatThinking] = useState(false);
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);
  
  const [userQuery, setUserQuery] = useState('');
  const [isSendingQuery, setIsSendingQuery] = useState(false);
  const [querySent, setQuerySent] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [proposalText, setProposalText] = useState('');
  const [showProposalInput, setShowProposalInput] = useState(false);

  // Analysis Page Query State
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [isSendingAnalysisQuery, setIsSendingAnalysisQuery] = useState(false);
  const [analysisQuerySent, setAnalysisQuerySent] = useState(false);

  // Insurance Modal State
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [insuranceVehicle, setInsuranceVehicle] = useState<Vehicle | null>(null);
  const [insuranceRecommendation, setInsuranceRecommendation] = useState<{recommendedPlanId: string, reason: string} | null>(null);
  const [insuranceChatQuery, setInsuranceChatQuery] = useState('');
  const [insuranceChatHistory, setInsuranceChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [isInsuranceChatThinking, setIsInsuranceChatThinking] = useState(false);
  const [insuranceSellerQuery, setInsuranceSellerQuery] = useState('');
  const [insuranceSellerQuerySent, setInsuranceSellerQuerySent] = useState(false);

  // Signing & Receipt State
  const [isSigning, setIsSigning] = useState(false);
  const [receipt, setReceipt] = useState<BlockchainReceipt | null>(null);

  // My Garage Data
  const [myActivity, setMyActivity] = useState<{contracts: Contract[], queries: UserQuery[], savedVisuals: SavedVisual[]}>({ contracts: [], queries: [], savedVisuals: [] });
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [filterContract, setFilterContract] = useState('All');
  const [filterQuery, setFilterQuery] = useState('All');

  // Deep Link Refs for scrolling
  const contractListRef = useRef<HTMLDivElement>(null);
  const queryListRef = useRef<HTMLDivElement>(null);
  const insChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    visChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visChatHistory]);

  useEffect(() => {
    insChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [insuranceChatHistory]);

  // Fetch user activity when switching to garage or on mount
  useEffect(() => {
      const loadActivity = async () => {
          const data = await fetchUserActivity(user.uid, useMockData);
          setMyActivity(data);
      };
      loadActivity();
  }, [user.uid, useMockData, activeTab]);

  const notifications = useMemo(() => {
      const notes: {id: string, type: 'info'|'success'|'warning', msg: string, targetId: string, targetType: 'contract' | 'query'}[] = [];
      myActivity.queries.forEach(q => {
          if (q.status === 'closed' && q.reply) {
              notes.push({ id: q.id, type: 'success', msg: `Query Replied: ${q.vehicleName} - "${q.reply.substring(0, 30)}..."`, targetId: q.id, targetType: 'query' });
          }
      });
      myActivity.contracts.forEach(c => {
          if (c.status === 'pending') {
              notes.push({ id: c.id, type: 'info', msg: `Contract Updated/Pending Review: ${c.vehicleName}`, targetId: c.id, targetType: 'contract' });
          }
      });
      return notes;
  }, [myActivity]);

  const urlToBase64 = async (url: string): Promise<string | null> => {
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
          });
      } catch (e) {
          console.error("Failed to convert image to base64", e);
          return null;
      }
  };

  const handleLogoClick = () => {
      setActiveTab('home');
      setStep('questionnaire');
      setQIndex(0);
      setAnswers(['', '', '', '']);
  }

  const handleNotificationClick = (n: typeof notifications[0]) => {
      setActiveTab('garage');
      
      if (n.targetType === 'query') {
          setFilterQuery('All'); // Ensure it's visible
          setTimeout(() => {
              queryListRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 300);
      } else if (n.targetType === 'contract') {
          setFilterContract('All');
          setTimeout(() => {
              contractListRef.current?.scrollIntoView({ behavior: 'smooth' });
              const contract = myActivity.contracts.find(c => c.id === n.targetId);
              if(contract) resumeContract(contract);
          }, 300);
      }
  }

  // --- DELETE HANDLER (FIXED) ---
  const handleDelete = async (e: React.MouseEvent, collectionName: string, id: string) => {
      e.preventDefault();
      e.stopPropagation(); // Stop event bubbling to parent click handlers
      
      if(!confirm("Are you sure you want to remove this item?")) return;
      
      setDeletingIds(prev => new Set(prev).add(id));
      
      try {
          await deleteDocument(collectionName, id);
          
          // Force immediate state update to remove item from view
          setMyActivity(prev => {
              if (collectionName === 'contracts') {
                  return { ...prev, contracts: prev.contracts.filter(c => c.id !== id) };
              } else if (collectionName === 'queries') {
                  return { ...prev, queries: prev.queries.filter(q => q.id !== id) };
              } else if (collectionName === 'saved_visuals') {
                  return { ...prev, savedVisuals: prev.savedVisuals.filter(v => v.id !== id) };
              }
              return prev;
          });
      } catch (e) { 
          console.error("Delete failed", e); 
          alert("Could not delete item.");
      } finally {
          setDeletingIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
      }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsUpdatingProfile(true);
      try {
          await updateUserProfile(user.uid, 'user', profileForm);
          setShowProfileModal(false);
          // Ideally update the parent 'user' state via prop callback, but for now we rely on re-renders or next login
          alert("Profile updated successfully!");
      } catch(e) {
          console.error(e);
          alert("Failed to update profile.");
      } finally {
          setIsUpdatingProfile(false);
      }
  }

  // --- QUESTIONNAIRE HANDLERS ---
  const handleAnswer = (val: string) => {
      const newAns = [...answers];
      newAns[qIndex] = val;
      setAnswers(newAns);
  }

  const handleNextQ = () => {
      if (qIndex < QUESTIONS.length - 1) {
          setQIndex(qIndex + 1);
      } else {
          // Finished
          const summary = `People: ${answers[0]}. Terrain: ${answers[1]}. Use: ${answers[2]}. Budget: ${answers[3]}.`;
          setFinalPrompt(summary);
          setQIndex(qIndex + 1); // Move to summary review view
      }
  }

  // ... (Visualizer & Contract Handlers remain same) ...
  const handleIntentSubmit = async () => {
    setLoading(true);
    try {
      const result = await analyzeIntent(finalPrompt);
      setIntentResult(result);
      await updateAnalytics(result.category);
      const allVehicles = await fetchVehicles(useMockData);
      
      const budgetLimit = result.detected_budget || 0;
      const minSeats = result.min_seats || 2;
      
      const scoredVehicles = allVehicles.map(v => {
          let score = 0;
          if (budgetLimit > 0) {
              const price = v.price_range[0]; 
              if (price <= budgetLimit) { score += 30; if (price < budgetLimit * 0.8) score += 5; } else if (price <= budgetLimit * 1.15) { score += 10; } else { score -= 50; }
          }
          if (v.seats >= minSeats) { score += 25; if (v.seats === minSeats || v.seats === minSeats + 1) score += 5; } else { score -= 40; }
          const searchTerms = [ ...answers.join(' ').toLowerCase().split(/\s+/), result.category.toLowerCase(), ...(result.lifestyle_patterns || []).map((p: string) => p.toLowerCase()) ].filter(t => t.length > 2);
          const vString = JSON.stringify(v).toLowerCase();
          let keywordHits = 0;
          searchTerms.forEach(term => { if (vString.includes(term)) keywordHits++; });
          score += (keywordHits * 2); 
          const terrainInput = answers[1].toLowerCase();
          if (terrainInput.includes('snow') || terrainInput.includes('mud') || terrainInput.includes('off-road') || terrainInput.includes('mountain')) { if (v.drive === 'AWD' || v.drive === '4WD') score += 15; else if (v.drive === 'RWD') score -= 5; }
          const useInput = answers[2].toLowerCase();
          if (useInput.includes('commute') || useInput.includes('city')) { if (v.use_cases.includes('Efficient') || v.use_cases.includes('City Commute') || v.use_cases.includes('Eco-Friendly')) score += 10; }
          if (useInput.includes('camp') || useInput.includes('adventure')) { if (v.use_cases.includes('Camping') || v.use_cases.includes('Adventure')) score += 10; }
          return { ...v, score };
      });

      const matched = scoredVehicles.filter(v => v.score > -20).sort((a, b) => b.score - a.score);
      setVehicles(matched.length > 0 ? matched : allVehicles.slice(0, 6)); 
      setStep('matches');
    } catch (e) {
      console.error(e);
      alert("AI Intent Analysis failed. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = async (v: Vehicle, fromGarage = false) => {
      setSelectedVehicle(v);
      setGeneratedImages([]); 
      setVisChatHistory([{ text: `Viewing ${v.name}. Use the chat to modify the look (e.g. "make it red").`, type: 'system' }]);
      if (!fromGarage) {
          setStep('visualizer');
          setVisualizing(true);
          let base64Ref = null;
          if (v.image_url) { base64Ref = await urlToBase64(v.image_url); setSelectedVehicleBase64(base64Ref); }
          try {
              const context = `${answers[2] || 'Showroom'} in ${answers[1] || 'City'}`;
              const images = await generateVehicleVisuals(v.name, v.visual_desc || v.name, context, undefined, base64Ref || undefined);
              setGeneratedImages(images);
          } catch (e) { console.error(e); } finally { setVisualizing(false); }
      }
  };

  const handleVisualizerChat = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!visChatQuery.trim() || !selectedVehicle) return;
      const mod = visChatQuery;
      setVisChatHistory(prev => [...prev, { text: mod, type: 'user' }]);
      setVisChatQuery('');
      setVisualizing(true);
      try {
          const context = `${answers[2] || 'Showroom'} in ${answers[1] || 'City'}`;
          const images = await generateVehicleVisuals(selectedVehicle.name, selectedVehicle.visual_desc || selectedVehicle.name, context, mod, selectedVehicleBase64 || undefined);
          setGeneratedImages(images);
          setVisChatHistory(prev => [...prev, { text: `Generated new visuals with modification: "${mod}"`, type: 'system' }]);
      } catch (e) { console.error(e); } finally { setVisualizing(false); }
  };

  const handleSaveVisual = async (imageUrl: string) => {
      if (!selectedVehicle) return;
      setIsSavingImg(true);
      try {
          const compressedUrl = await compressImage(imageUrl);
          await saveVisual({ userId: user.uid, vehicleId: selectedVehicle.id, vehicleName: selectedVehicle.name, imageUrl: compressedUrl, prompt: visChatQuery || 'Standard View' });
          setSavedImageIds(prev => new Set(prev).add(imageUrl));
          setMyActivity(prev => ({ ...prev, savedVisuals: [...prev.savedVisuals, { id: 'temp-'+Date.now(), userId: user.uid, vehicleId: selectedVehicle.id, vehicleName: selectedVehicle.name, imageUrl: compressedUrl, prompt: visChatQuery || 'Standard View', created_at: new Date().toISOString() }] }));
      } catch (e) { console.error(e); alert("Failed to save image. It might be too large."); } finally { setIsSavingImg(false); }
  }

  const handleStartDrafting = async () => {
      if (!selectedVehicle) return;
      setLoading(true);
      try {
          const template = selectedVehicle.contract_template || "Standard Agreement: {{buyer_name}} buys {{vehicle_name}}.";
          const fields = await extractContractVariables(template);
          setRequiredFields(fields);
          const initialValues: Record<string, string> = {};
          fields.forEach(f => {
              const lower = f.toLowerCase();
              if (lower.includes('name')) initialValues[f] = user.name;
              else if (lower.includes('email')) initialValues[f] = user.email;
              else initialValues[f] = '';
          });
          setContractInputValues(initialValues);
          setShowContractInputModal(true);
      } catch(e) { console.error(e); alert("Could not analyze contract template."); } finally { setLoading(false); }
  };

  const handleGenerateFinalContract = async () => {
      setShowContractInputModal(false);
      setLoading(true);
      try {
        const template = selectedVehicle?.contract_template || "Standard Agreement: {{buyer_name}} buys {{vehicle_name}}.";
        const contract = await buildContract(template, { ...selectedVehicle, vehicle_name: selectedVehicle?.name }, contractInputValues);
        setContractData(contract);
        setEditableContractText(contract.final_contract_html); 
        
        const newId = await saveContract({
            userId: user.uid, sellerId: 'generic_seller', vehicleId: selectedVehicle!.id, vehicleName: selectedVehicle!.name,
            contract_html: contract.final_contract_html, contract_summary: contract.summary || "Draft", highlighted_clauses: {}, status: 'pending'
        });
        setCurrentContractId(newId);
        setStep('contract');
        setActiveTab('home'); 
      } catch (e) { console.error(e); alert("Failed to build contract."); } finally { setLoading(false); }
  }

  const handleJurisdictionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newRegion = e.target.value;
      setContractRegion(newRegion);
      if (!editableContractText) return;

      setIsAdaptingContract(true);
      try {
          const adaptedHtml = await adaptContractToJurisdiction(editableContractText, newRegion);
          setEditableContractText(adaptedHtml);
      } catch(e) {
          console.error(e);
      } finally {
          setIsAdaptingContract(false);
      }
  }

  const handleContractChat = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!contractChatQuery.trim() || !editableContractText) return;
      const q = contractChatQuery;
      setContractChatQuery('');
      setContractChatHistory(prev => [...prev, { role: 'user', text: q }]);
      setIsContractChatThinking(true);
      setHighlightedQuote(null);
      try {
          const plainText = editableContractText.replace(/<[^>]+>/g, ' ');
          const result = await queryContractAssistant(q, plainText);
          setContractChatHistory(prev => [...prev, { role: 'ai', text: result.answer }]);
          if (result.citation_quote) { setHighlightedQuote(result.citation_quote); }
      } catch (e) { console.error(e); setContractChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, I couldn't analyze the contract right now." }]); } finally { setIsContractChatThinking(false); }
  };

  const renderContractContent = () => {
      if (!highlightedQuote) return <div dangerouslySetInnerHTML={{ __html: editableContractText }} />;
      try {
          const escapedQuote = highlightedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const looseRegex = escapedQuote.replace(/\s+/g, '[\\s\\n\\r]+');
          const regex = new RegExp(`(${looseRegex})`, 'gi');
          const highlightedHtml = editableContractText.replace(regex, '<mark class="bg-yellow-300 text-black px-1 rounded shadow-sm">$1</mark>');
          return <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />;
      } catch (e) { console.warn("Highlighting failed", e); return <div dangerouslySetInnerHTML={{ __html: editableContractText }} />; }
  };

  const handleSendQuery = async () => {
      if (!userQuery.trim() || !selectedVehicle) return;
      setIsSendingQuery(true);
      try {
          await saveUserQuery({ userId: user.uid, userName: user.name, sellerId: 'generic_seller_id', vehicleId: selectedVehicle.id, vehicleName: selectedVehicle.name, message: userQuery });
          setQuerySent(true); setUserQuery('');
          setMyActivity(prev => ({ ...prev, queries: [...prev.queries, { id: 'temp-'+Date.now(), userId: user.uid, userName: user.name, sellerId: 'generic_seller_id', vehicleId: selectedVehicle.id, vehicleName: selectedVehicle.name, message: userQuery, status: 'open', created_at: new Date().toISOString() }] }));
      } catch (e) { console.error(e); } finally { setIsSendingQuery(false); setTimeout(() => setQuerySent(false), 3000); }
  };

  // UPDATED FUNCTION: Triggers contract revision status
  const handleSendAnalysisQuery = async () => {
      if (!analysisQuery.trim() || !selectedVehicle || !currentContractId) return;
      setIsSendingAnalysisQuery(true);
      try {
          // 1. Update Contract Status to 'needs_changes' so it appears in Seller's Contracts List
          await updateContractStatus(currentContractId, 'needs_changes', undefined, { change_request_message: analysisQuery });
          
          // 2. Also save as a query for history/sidebar context (tagged specifically)
          await saveUserQuery({ 
              userId: user.uid, 
              userName: user.name, 
              sellerId: 'generic_seller_id', 
              vehicleId: selectedVehicle.id, 
              vehicleName: selectedVehicle.name, 
              message: `[Analysis Phase Question]: ${analysisQuery}` 
          });

          setAnalysisQuerySent(true);
          setAnalysisQuery('');
          
          alert("Request sent to seller. The contract status has been updated to 'Requested Changes'.");
          setActiveTab('garage'); // Redirect to garage to see status
          setFilterContract('needs_changes'); // Auto filter to show the relevant item
      } catch(e) { console.error(e); } finally { setIsSendingAnalysisQuery(false); setTimeout(() => setAnalysisQuerySent(false), 3000); }
  }

  const handleProposeChange = async () => {
      if (!proposalText.trim() || !selectedVehicle || !currentContractId) return;
      setIsSendingQuery(true);
      try {
          await updateContractStatus(currentContractId, 'needs_changes', undefined, { change_request_message: proposalText });
          const proposalMsg = `[CONTRACT REVISION REQUEST] ${proposalText}`;
          await saveUserQuery({ userId: user.uid, userName: user.name, sellerId: 'generic_seller_id', vehicleId: selectedVehicle.id, vehicleName: selectedVehicle.name, message: proposalMsg });
          setProposalText(''); setShowProposalInput(false);
          alert("Request sent to seller. You will be notified when the contract is revised.");
          setStep('questionnaire'); setActiveTab('garage'); 
      } catch (e) { console.error(e); } finally { setIsSendingQuery(false); }
  };

  const analyzeContract = async () => {
    setLoading(true);
    try {
      const plainText = editableContractText.replace(/<[^>]+>/g, ' ');
      const result = await highlightClauses(plainText, contractRegion);
      setAnalysis(result);
      if (selectedVehicle && currentContractId) { await updateContractStatus(currentContractId, 'pending'); }
      setStep('review');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleDigitalSign = async () => {
      if (!selectedVehicle || !currentContractId) return;
      setIsSigning(true);
      try {
          const receiptData = await signContractOnChain(currentContractId, user.email, selectedVehicle.id);
          setReceipt(receiptData);
          await updateContractStatus(currentContractId, 'accepted', receiptData);
          setStep('receipt');
      } catch (e) { console.error("Signing failed", e); alert("Digital Signing Failed. Please try again."); } finally { setIsSigning(false); }
  }

  const resumeContract = async (c: Contract) => {
      const allVehicles = await fetchVehicles(useMockData);
      const vehicle = allVehicles.find(v => v.id === c.vehicleId);
      if (vehicle) {
          setSelectedVehicle(vehicle); setCurrentContractId(c.id); setEditableContractText(c.contract_html); setContractData({ contract_html: c.contract_html, summary: c.contract_summary, seller_note: c.seller_note });
          setStep('contract'); setActiveTab('home'); 
      } else { alert("Vehicle data associated with this contract could not be found."); }
  }

  const loadSavedVisual = async (sv: SavedVisual) => {
      const allVehicles = await fetchVehicles(useMockData);
      const vehicle = allVehicles.find(v => v.id === sv.vehicleId);
      if (vehicle) { setSelectedVehicle(vehicle); setGeneratedImages([sv.imageUrl]); setStep('visualizer'); setActiveTab('home'); } else { alert("Vehicle data for this visual could not be found."); }
  }

  const handleRemindSeller = async () => { setQuerySent(true); setTimeout(() => setQuerySent(false), 2000); alert("Reminder sent to seller!"); }

  // --- INSURANCE HANDLERS ---
  const handleOpenInsurance = async (contract: Contract) => {
      const allVehicles = await fetchVehicles(useMockData);
      const vehicle = allVehicles.find(v => v.id === contract.vehicleId);
      if (vehicle) {
          setInsuranceVehicle(vehicle);
          setShowInsuranceModal(true);
          setInsuranceChatHistory([]);
          // If we have intent data, run recommendation logic
          if (intentResult && vehicle.insurance_options) {
              const rec = await analyzeInsuranceNeeds(intentResult, vehicle.insurance_options);
              setInsuranceRecommendation(rec);
          } else {
              // Fallback logic if user hasn't run questionnaire this session
              const fakeIntent = { category: 'General', lifestyle_patterns: ['Standard'], recommended_features: [], min_seats: 4 };
              const rec = await analyzeInsuranceNeeds(fakeIntent as any, vehicle.insurance_options || []);
              setInsuranceRecommendation(rec);
          }
      }
  }

  const handleInsuranceChat = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!insuranceChatQuery.trim()) return;
      const q = insuranceChatQuery;
      setInsuranceChatQuery('');
      setInsuranceChatHistory(prev => [...prev, { role: 'user', text: q }]);
      setIsInsuranceChatThinking(true);
      try {
          const answer = await queryInsuranceAgent(q, insuranceVehicle?.insurance_options || []);
          setInsuranceChatHistory(prev => [...prev, { role: 'ai', text: answer }]);
      } catch (e) {
          setInsuranceChatHistory(prev => [...prev, { role: 'ai', text: "Unable to reach insurance agent." }]);
      } finally {
          setIsInsuranceChatThinking(false);
      }
  }

  const handleSendInsuranceQuery = async () => {
      if (!insuranceSellerQuery.trim() || !insuranceVehicle) return;
      setInsuranceSellerQuerySent(true);
      try {
          await saveUserQuery({
              userId: user.uid,
              userName: user.name,
              sellerId: 'generic_seller_id',
              vehicleId: insuranceVehicle.id,
              vehicleName: insuranceVehicle.name,
              message: `[INSURANCE QUERY]: ${insuranceSellerQuery}`
          });
          setInsuranceSellerQuery('');
          alert("Query sent to seller!");
      } catch(e) { console.error(e); } finally { setTimeout(() => setInsuranceSellerQuerySent(false), 2000); }
  }

  const filteredGarageContracts = myActivity.contracts.filter(c => filterContract === 'All' || c.status === filterContract);
  const filteredGarageQueries = myActivity.queries.filter(q => filterQuery === 'All' || q.status === filterQuery);

  return (
    <div className="min-h-screen bg-cyber-black text-cyber-text flex flex-col relative overflow-hidden font-sans">
       <DotScreenShader />

       {/* Profile Modal */}
       {showProfileModal && (
           <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-md rounded-xl border border-cyber-primary shadow-neon-blue flex flex-col animate-scale-in">
                   <div className="p-4 border-b border-cyber-border bg-cyber-dark flex justify-between items-center rounded-t-xl">
                       <h3 className="text-lg font-bold text-white"><i className="fas fa-user-circle mr-2"></i> Buyer Profile</h3>
                       <button onClick={() => setShowProfileModal(false)} className="text-cyber-dim hover:text-white"><i className="fas fa-times"></i></button>
                   </div>
                   <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Full Name</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Phone Number</label>
                           <input type="tel" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} placeholder="+91..." />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Address</label>
                           <textarea className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary h-20 resize-none" value={profileForm.address} onChange={e => setProfileForm({...profileForm, address: e.target.value})} placeholder="Residential Address..." />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-cyber-dim mb-1 uppercase">Personal Interests</label>
                           <input type="text" className="w-full bg-cyber-black border border-cyber-border rounded p-2 text-white outline-none focus:border-cyber-primary" value={profileForm.interests} onChange={e => setProfileForm({...profileForm, interests: e.target.value})} placeholder="e.g. Off-roading, EVs, Family trips" />
                       </div>
                       <button type="submit" disabled={isUpdatingProfile} className="w-full bg-cyber-primary text-black font-bold py-2 rounded mt-4 hover:bg-white transition-all disabled:opacity-50">
                           {isUpdatingProfile ? <i className="fas fa-spinner fa-spin"></i> : "Update Profile"}
                       </button>
                   </form>
               </div>
           </div>
       )}

       {/* Insurance Hub Modal */}
       {showInsuranceModal && insuranceVehicle && (
           <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-6xl h-[90vh] rounded-xl border border-cyber-secondary shadow-neon-purple flex flex-col animate-scale-in overflow-hidden">
                   <div className="p-4 border-b border-cyber-border bg-cyber-dark flex justify-between items-center">
                       <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-shield-virus text-cyber-secondary"></i> Insurance Garage: <span className="text-cyber-primary">{insuranceVehicle.name}</span></h3>
                       <button onClick={() => setShowInsuranceModal(false)} className="text-cyber-dim hover:text-white"><i className="fas fa-times text-xl"></i></button>
                   </div>
                   
                   <div className="flex-1 flex overflow-hidden">
                       {/* LEFT: Marketplace & Recommendation */}
                       <div className="w-2/3 p-6 overflow-y-auto border-r border-cyber-border space-y-6">
                           
                           {/* AI Recommendation Banner */}
                           {insuranceRecommendation && (
                               <div className="bg-cyber-secondary/10 border border-cyber-secondary/50 rounded-xl p-6 relative overflow-hidden">
                                   <div className="absolute -right-10 -top-10 bg-cyber-secondary/20 w-40 h-40 rounded-full blur-3xl"></div>
                                   <h4 className="text-cyber-secondary font-bold text-lg mb-2 flex items-center gap-2"><i className="fas fa-robot"></i> AI Recommendation</h4>
                                   <p className="text-white text-sm mb-4">"{insuranceRecommendation.reason}"</p>
                                   <div className="text-xs text-cyber-dim font-mono uppercase tracking-widest">Best fit based on your usage profile</div>
                               </div>
                           )}

                           <div>
                               <h4 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-tags text-cyber-primary"></i> Available Plans</h4>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   {(insuranceVehicle.insurance_options || []).length > 0 ? (
                                       insuranceVehicle.insurance_options!.map(plan => (
                                           <div key={plan.id} className={`p-4 rounded-xl border transition-all relative ${insuranceRecommendation?.recommendedPlanId === plan.id ? 'border-cyber-secondary bg-cyber-secondary/5 shadow-neon-purple' : 'border-cyber-border bg-cyber-black hover:border-cyber-primary'}`}>
                                               {insuranceRecommendation?.recommendedPlanId === plan.id && <div className="absolute top-0 right-0 bg-cyber-secondary text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">RECOMMENDED</div>}
                                               <div className="flex justify-between items-start mb-2">
                                                   <div>
                                                       <h5 className="font-bold text-white text-lg">{plan.provider}</h5>
                                                       <p className="text-cyber-primary text-sm">{plan.name}</p>
                                                   </div>
                                                   <div className="text-right">
                                                       <div className="text-white font-bold">₹{plan.premium.toLocaleString()}</div>
                                                       <div className="text-[10px] text-cyber-dim">/ year</div>
                                                   </div>
                                               </div>
                                               <div className="text-xs text-cyber-text mb-3">{plan.coverage_details}</div>
                                               <div className="flex flex-wrap gap-2 mb-4">
                                                   <span className="px-2 py-0.5 rounded bg-cyber-dim/20 text-cyber-dim text-[10px] border border-cyber-dim/30">{plan.type}</span>
                                                   {plan.addons.map((a, i) => (
                                                       <span key={i} className="px-2 py-0.5 rounded bg-cyber-primary/10 text-cyber-primary text-[10px] border border-cyber-primary/30">{a}</span>
                                                   ))}
                                               </div>
                                               <button className="w-full py-2 bg-white text-black font-bold rounded text-sm hover:bg-cyber-primary hover:scale-[1.02] transition-all">Select Plan</button>
                                           </div>
                                       ))
                                   ) : (
                                       <div className="col-span-2 text-center py-10 text-cyber-dim italic bg-cyber-black/30 rounded border border-cyber-border">No insurance plans listed by seller yet.</div>
                                   )}
                               </div>
                           </div>

                           <div className="pt-6 border-t border-cyber-border">
                               <h4 className="text-white font-bold mb-4 flex items-center gap-2"><i className="fas fa-file-invoice text-green-400"></i> Your Policies</h4>
                               <div className="text-sm text-cyber-dim italic">No active policies found for this vehicle. Select a plan above to purchase.</div>
                           </div>
                       </div>

                       {/* RIGHT: Chatbot & Support */}
                       <div className="w-1/3 flex flex-col bg-cyber-black">
                           <div className="p-4 bg-cyber-dark border-b border-cyber-border">
                               <h4 className="text-white font-bold flex items-center gap-2"><i className="fas fa-headset text-cyber-secondary"></i> Insurance Assistant</h4>
                               <p className="text-[10px] text-cyber-dim">Ask about exclusions, claims, or compare plans.</p>
                           </div>
                           <div className="flex-1 overflow-y-auto p-4 space-y-3">
                               {insuranceChatHistory.length === 0 && <div className="text-center text-cyber-dim text-xs mt-10 opacity-50">Try asking: "What does Zero-Dep cover?" or "Compare the HDFC and ICICI plans".</div>}
                               {insuranceChatHistory.map((m, i) => (
                                   <div key={i} className={`p-3 rounded-lg text-xs max-w-[90%] ${m.role === 'user' ? 'bg-cyber-secondary/20 text-white ml-auto border border-cyber-secondary/50' : 'bg-cyber-dark text-cyber-dim mr-auto border border-cyber-border'}`}>
                                       {m.text}
                                   </div>
                               ))}
                               {isInsuranceChatThinking && <div className="text-xs text-cyber-secondary animate-pulse ml-2">Typing...</div>}
                               <div ref={insChatEndRef} />
                           </div>
                           <form onSubmit={handleInsuranceChat} className="p-3 border-t border-cyber-border bg-cyber-dark">
                               <div className="flex gap-2">
                                   <input className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-xs text-white focus:border-cyber-secondary outline-none" placeholder="Ask AI..." value={insuranceChatQuery} onChange={e => setInsuranceChatQuery(e.target.value)} disabled={isInsuranceChatThinking} />
                                   <button type="submit" disabled={isInsuranceChatThinking} className="text-cyber-secondary hover:text-white"><i className="fas fa-paper-plane"></i></button>
                               </div>
                           </form>

                           <div className="p-4 border-t border-cyber-border bg-cyber-dark/50">
                               <h5 className="text-white text-xs font-bold mb-2">Message Seller</h5>
                               <div className="flex gap-2">
                                   <input className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-xs text-white" placeholder="Specific query..." value={insuranceSellerQuery} onChange={e => setInsuranceSellerQuery(e.target.value)} />
                                   <button onClick={handleSendInsuranceQuery} disabled={insuranceSellerQuerySent} className="bg-cyber-primary text-black px-3 py-1 rounded text-xs font-bold hover:bg-white">{insuranceSellerQuerySent ? <i className="fas fa-check"></i> : 'Send'}</button>
                               </div>
                           </div>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {/* Contract Input Modal */}
       {showContractInputModal && (
           <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="glass-panel w-full max-w-lg rounded-xl border border-cyber-primary shadow-neon-blue flex flex-col animate-scale-in">
                   <div className="p-6 border-b border-cyber-border bg-cyber-dark rounded-t-xl">
                       <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-pen-fancy text-cyber-primary"></i> Contract Details</h3>
                       <p className="text-xs text-cyber-dim mt-1">The seller's contract requires the following information to proceed.</p>
                   </div>
                   <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                       {requiredFields.map((field, i) => (
                           <div key={i}>
                               <label className="block text-xs font-bold text-cyber-primary mb-1 uppercase tracking-wider">{field}</label>
                               <input className="w-full bg-cyber-black border border-cyber-border rounded p-3 text-white text-sm focus:border-cyber-primary outline-none transition-all" value={contractInputValues[field] || ''} onChange={(e) => setContractInputValues({...contractInputValues, [field]: e.target.value})} placeholder={`Enter ${field}`} />
                           </div>
                       ))}
                   </div>
                   <div className="p-6 border-t border-cyber-border bg-cyber-black/50 rounded-b-xl flex justify-end gap-3">
                       <button onClick={() => setShowContractInputModal(false)} className="px-4 py-2 text-cyber-dim hover:text-white text-sm">Cancel</button>
                       <button onClick={handleGenerateFinalContract} disabled={loading} className="px-6 py-2 bg-cyber-primary text-black font-bold rounded hover:bg-white transition-all shadow-neon-blue text-sm uppercase flex items-center gap-2">{loading ? <i className="fas fa-spinner fa-spin"></i> : null} Create Document</button>
                   </div>
               </div>
           </div>
       )}

       <header className="px-8 py-6 flex justify-between items-center relative z-20 border-b border-cyber-border bg-cyber-black/50 backdrop-blur-md">
         <div onClick={handleLogoClick} className="font-bold text-2xl text-white tracking-wide flex items-center gap-2 group cursor-pointer hover:scale-105 transition-transform"><i className="fas fa-satellite-dish text-cyber-primary group-hover:animate-spin"></i> Teckion<span className="text-cyber-primary">.User</span></div>
         <div className="flex gap-4">
             <button onClick={() => setActiveTab('home')} className={`px-4 py-2 rounded transition-all text-sm font-bold ${activeTab === 'home' ? 'bg-cyber-primary/20 text-white shadow-neon-blue' : 'text-cyber-dim hover:text-white'}`}><i className="fas fa-home mr-2"></i>Home</button>
             <button onClick={() => setActiveTab('garage')} className={`px-4 py-2 rounded transition-all text-sm font-bold ${activeTab === 'garage' ? 'bg-cyber-primary/20 text-white shadow-neon-blue' : 'text-cyber-dim hover:text-white'}`}><i className="fas fa-warehouse mr-2"></i>My Garage</button>
             <button onClick={() => setActiveTab('notifications')} className={`px-4 py-2 rounded transition-all text-sm font-bold relative ${activeTab === 'notifications' ? 'bg-cyber-primary/20 text-white shadow-neon-blue' : 'text-cyber-dim hover:text-white'}`}><i className="fas fa-bell mr-2"></i>Notifications {notifications.length > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}</button>
         </div>
         <div className="flex items-center gap-4">
             <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-2 px-3 py-1 rounded bg-cyber-primary/10 border border-cyber-primary hover:bg-cyber-primary/20 transition-all text-cyber-primary text-xs font-bold uppercase tracking-wider">
                 <i className="fas fa-user-circle"></i> Profile
             </button>
             <button onClick={onLogout} className="text-cyber-dim hover:text-cyber-accent transition-colors hover:shadow-neon-red rounded-full p-2"><i className="fas fa-sign-out-alt"></i></button>
         </div>
       </header>

       <main className={`flex-1 p-6 max-w-6xl mx-auto w-full relative z-10 flex flex-col ${step === 'questionnaire' && activeTab === 'home' ? 'justify-end pb-12' : ''}`}>
         
         {/* NOTIFICATIONS TAB */}
         {activeTab === 'notifications' && (
             <div className="animate-fade-in-up">
                 <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><i className="fas fa-bell text-cyber-primary"></i> Notifications Center</h2>
                 <div className="space-y-4">
                     {notifications.length > 0 ? (
                         notifications.map((n, i) => (
                             <div key={i} onClick={() => handleNotificationClick(n)} className={`p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-neon-blue flex justify-between items-center ${n.type === 'success' ? 'bg-green-900/10 border-green-500/30 hover:bg-green-900/20' : 'bg-blue-900/10 border-blue-500/30 hover:bg-blue-900/20'}`}>
                                 <div className="flex items-center gap-4">
                                     <div className={`w-10 h-10 rounded-full flex items-center justify-center ${n.type === 'success' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}><i className={`fas ${n.type === 'success' ? 'fa-check' : 'fa-info'}`}></i></div>
                                     <div><p className="text-white text-sm font-bold">{n.msg}</p><p className="text-xs text-cyber-dim mt-1">Tap to view details</p></div>
                                 </div>
                                 <i className="fas fa-chevron-right text-cyber-dim"></i>
                             </div>
                         ))
                     ) : ( <div className="text-center py-20 bg-cyber-dark/30 rounded-xl border border-cyber-border"><i className="fas fa-bell-slash text-4xl text-cyber-dim mb-4"></i><p className="text-cyber-dim">No new notifications.</p></div> )}
                 </div>
             </div>
         )}

         {/* GARAGE TAB */}
         {activeTab === 'garage' && (
             <div className="animate-fade-in-up space-y-8">
                 <div ref={contractListRef}>
                     <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-file-contract text-cyber-secondary"></i> My Contracts</h2><select className="bg-cyber-black border border-cyber-border rounded px-2 py-1 text-xs text-white outline-none" value={filterContract} onChange={(e) => setFilterContract(e.target.value)}><option value="All">All Status</option><option value="pending">Pending Review</option><option value="needs_changes">Requested Changes</option><option value="accepted">Signed</option></select></div>
                     {filteredGarageContracts.length > 0 ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filteredGarageContracts.map(c => (
                                 <div key={c.id} className={`glass-panel p-4 rounded-lg border flex flex-col justify-between transition-all relative group ${c.status === 'accepted' ? 'border-green-500/50 shadow-neon-green bg-green-900/10' : 'border-cyber-border hover:border-cyber-secondary'}`}>
                                     <button 
                                        onClick={(e) => handleDelete(e, 'contracts', c.id)} 
                                        className="absolute top-2 right-2 text-cyber-dim hover:text-red-500 z-20 p-2"
                                        disabled={deletingIds.has(c.id)}
                                     >
                                        {deletingIds.has(c.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                     </button>
                                     <div className="flex justify-between items-start mb-2 pr-6">
                                         <div><div className="font-bold text-white text-lg">{c.vehicleName}</div><div className="text-xs text-cyber-dim">Created: {new Date(c.created_at).toLocaleDateString()}</div></div>
                                         <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold mt-1 inline-block ${c.status === 'accepted' ? 'bg-green-500 text-black' : 'bg-yellow-500/20 text-yellow-500'}`}>{c.status === 'accepted' ? <><i className="fas fa-check-circle"></i> Signed</> : c.status.replace('_', ' ')}</span>
                                     </div>
                                     {c.status === 'accepted' && c.blockchain_receipt ? (
                                         <div className="mt-2 bg-black/40 p-2 rounded border border-green-500/30 text-[10px] font-mono text-green-400 break-all"><div className="flex items-center gap-2 mb-1 text-xs font-bold text-green-500"><i className="fas fa-link"></i> Blockchain Verified</div><div className="opacity-70">Tx: {c.blockchain_receipt.tx_hash}</div></div>
                                     ) : (
                                         <div className="flex gap-2 mt-4 self-end w-full justify-end">
                                             <button onClick={() => handleOpenInsurance(c)} className="bg-cyber-secondary/20 text-cyber-secondary hover:bg-cyber-secondary hover:text-white px-3 py-1 rounded text-xs font-bold transition-all border border-cyber-secondary/50"><i className="fas fa-shield-alt"></i> Insurance</button>
                                             <button onClick={() => handleRemindSeller()} className="bg-cyber-primary/10 text-cyber-primary hover:bg-cyber-primary hover:text-black px-3 py-1 rounded text-xs font-bold transition-all border border-cyber-primary/50"><i className="fas fa-bell"></i> Remind</button>
                                             <button onClick={() => resumeContract(c)} className="bg-white/10 text-white hover:bg-white hover:text-black px-3 py-1 rounded text-xs font-bold transition-all">Resume</button>
                                         </div>
                                     )}
                                 </div>
                             ))}</div>
                     ) : ( <p className="text-cyber-dim text-sm italic">No contracts found.</p> )}
                 </div>
                 {/* ... (Saved Visuals & Queries sections) ... */}
                 <div>
                     <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><i className="fas fa-images text-cyber-primary"></i> Saved Visualizations</h2>
                     {myActivity.savedVisuals.length > 0 ? (
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{myActivity.savedVisuals.map(sv => (
                                 <div key={sv.id} className="glass-panel rounded-lg overflow-hidden group cursor-pointer hover:border-cyber-primary transition-all relative">
                                     <button 
                                        onClick={(e) => handleDelete(e, 'saved_visuals', sv.id)} 
                                        className="absolute top-2 right-2 z-20 bg-black/50 p-2 rounded hover:bg-red-500 text-white"
                                        disabled={deletingIds.has(sv.id)}
                                     >
                                        {deletingIds.has(sv.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                     </button>
                                     <div className="aspect-video relative" onClick={() => loadSavedVisual(sv)}><img src={sv.imageUrl} className="w-full h-full object-cover" alt={sv.vehicleName} /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span className="text-cyber-primary text-xs font-bold"><i className="fas fa-eye mr-1"></i> View Car</span></div></div>
                                     <div className="p-2 text-xs"><div className="font-bold text-white">{sv.vehicleName}</div><div className="text-cyber-dim truncate">{sv.prompt}</div></div>
                                 </div>
                             ))}</div>
                     ) : ( <p className="text-cyber-dim text-sm italic">No saved visuals yet. Generate some images!</p> )}
                 </div>
                 <div ref={queryListRef}>
                     <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-white flex items-center gap-2"><i className="fas fa-comments text-cyber-accent"></i> My Queries</h2><select className="bg-cyber-black border border-cyber-border rounded px-2 py-1 text-xs text-white outline-none" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)}><option value="All">All</option><option value="open">Open</option><option value="closed">Replied</option></select></div>
                     {filteredGarageQueries.length > 0 ? (
                         <div className="space-y-3">{filteredGarageQueries.map(q => (
                                 <div key={q.id} className="glass-panel p-4 rounded-lg border border-cyber-border relative group">
                                     <button 
                                        onClick={(e) => handleDelete(e, 'queries', q.id)} 
                                        className="absolute top-2 right-2 text-cyber-dim hover:text-red-500 z-20 p-2"
                                        disabled={deletingIds.has(q.id)}
                                     >
                                        {deletingIds.has(q.id) ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash"></i>}
                                     </button>
                                     <div className="flex justify-between mb-2 pr-6"><span className="font-bold text-white text-sm">{q.vehicleName}</span><span className={`text-[10px] uppercase font-bold ${q.status === 'open' ? 'text-red-500' : 'text-green-500'}`}>{q.status}</span></div>
                                     <div className="text-cyber-dim text-sm bg-cyber-dark p-2 rounded italic">" {q.message} "</div>
                                     {q.reply && ( <div className="mt-2 text-cyber-primary text-sm ml-4 border-l-2 border-cyber-primary pl-2 animate-pulse-once"><span className="font-bold text-xs block mb-1">Seller Reply:</span>{q.reply}</div> )}
                                 </div>
                             ))}</div>
                     ) : ( <p className="text-cyber-dim text-sm italic">No queries sent.</p> )}
                 </div>
             </div>
         )}

         {/* HOME TAB */}
         {activeTab === 'home' && (
            <>
                 {/* Step 1: QUESTIONNAIRE */}
                 {step === 'questionnaire' && (
                   <div className="w-full h-full flex flex-col justify-between">
                     <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="text-center mb-8"><h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyber-primary via-white to-cyber-secondary drop-shadow-[0_0_20px_rgba(0,240,255,0.4)] tracking-tighter mb-2">TECKION AI</h1><p className="text-cyber-dim text-lg tracking-widest font-mono uppercase text-sm border-b border-cyber-primary/30 pb-2 inline-block">Intelligent Vehicle Matching System</p></div>
                        <ParticleTextEffect />
                     </div>
                     <div className="max-w-3xl mx-auto w-full animate-float-slow relative z-20 mt-auto">
                       <div className="glass-panel p-8 rounded-2xl border border-cyber-border shadow-neon-blue backdrop-blur-xl bg-cyber-black/80">
                         {qIndex < QUESTIONS.length ? (
                             <div className="flex flex-col md:flex-row items-center gap-6">
                                  <div className="w-16 h-16 bg-cyber-dark border border-cyber-primary rounded-full flex items-center justify-center shadow-neon-blue flex-shrink-0"><i className={`fas ${QUESTIONS[qIndex].icon} text-2xl text-cyber-primary`}></i></div>
                                  <div className="flex-1 w-full"><h2 className="text-2xl font-bold text-white mb-1">{QUESTIONS[qIndex].q}</h2><p className="text-cyber-dim text-xs mb-4">{QUESTIONS[qIndex].sub}</p><div className="flex gap-2"><input autoFocus className="flex-1 p-3 bg-cyber-black border border-cyber-border rounded-lg focus:border-cyber-primary focus:shadow-neon-blue outline-none text-white transition-all" placeholder="Type your answer here..." value={answers[qIndex]} onChange={(e) => handleAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && answers[qIndex] && handleNextQ()} /><button onClick={handleNextQ} disabled={!answers[qIndex]} className="px-6 py-3 bg-cyber-primary text-cyber-black font-bold rounded-lg hover:bg-white transition-all disabled:opacity-50"><i className="fas fa-arrow-right"></i></button></div></div>
                             </div>
                         ) : (
                             <>
                                  <h2 className="text-2xl font-bold text-white mb-2">Summary Review</h2>
                                  <textarea className="w-full p-4 bg-cyber-black border border-cyber-border rounded-xl focus:border-cyber-primary outline-none text-white transition-all text-sm mb-4 h-24" value={finalPrompt} onChange={(e) => setFinalPrompt(e.target.value)} />
                                  <button onClick={handleIntentSubmit} disabled={loading} className="w-full bg-cyber-primary text-cyber-black py-4 rounded-xl font-bold hover:bg-white hover:scale-[1.02] transition-all disabled:opacity-50 shadow-neon-blue uppercase tracking-widest flex items-center justify-center gap-2">{loading ? <><i className="fas fa-spinner fa-spin"></i> Matching Inventory...</> : 'Find My Perfect Match'}</button>
                             </>
                         )}
                         {qIndex < QUESTIONS.length && ( <div className="flex justify-center gap-2 mt-6">{QUESTIONS.map((_, i) => <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-300 ${i === qIndex ? 'bg-cyber-primary shadow-neon-blue' : (i < qIndex ? 'bg-cyber-primary/40' : 'bg-cyber-dark border border-cyber-border')}`}></div>)}</div> )}
                       </div>
                     </div>
                   </div>
                 )}

                 {/* Step 2: MATCHES */}
                 {step === 'matches' && (
                   <div className="animate-fade-in-up">
                     <div className="mb-8 flex items-center gap-4"><button onClick={() => setStep('questionnaire')} className="w-10 h-10 rounded-full border border-cyber-border flex items-center justify-center text-cyber-dim hover:border-cyber-primary hover:text-cyber-primary hover:shadow-neon-blue transition-all"><i className="fas fa-chevron-left"></i></button><div><h2 className="text-2xl font-bold text-white">Top Matches: <span className="text-cyber-primary">{intentResult?.category}</span></h2><p className="text-cyber-dim text-sm">Sorted by compatibility score.</p></div></div>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">{vehicles.map(v => (
                         <div key={v.id} className="glass-panel rounded-xl border border-cyber-border overflow-hidden group hover:border-cyber-primary transition-all duration-300 hover:shadow-neon-blue hover:-translate-y-2 cursor-pointer" onClick={() => handleSelectVehicle(v)}>
                            <div className="h-48 relative overflow-hidden bg-cyber-dark">
                                <img src={v.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-80 group-hover:opacity-100" alt={v.name} />
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-cyber-primary border border-cyber-primary/30">{v.drive}</div>
                                {(v as any).score > 0 && <div className="absolute bottom-2 right-2 bg-green-500/80 px-2 py-0.5 rounded text-[10px] font-bold text-black">{(v as any).score} pts</div>}
                            </div>
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2"><h3 className="text-xl font-bold text-white group-hover:text-cyber-primary transition-colors">{v.name}</h3><div className="flex flex-col items-end"><span className="text-xs text-cyber-dim bg-cyber-black px-2 py-0.5 rounded border border-cyber-border">{v.seats} Seats</span></div></div>
                                <div className="flex flex-wrap gap-2 mb-4 mt-2">{v.use_cases.map((u, i) => <span key={i} className="text-[10px] bg-cyber-dark border border-cyber-border px-2 py-1 rounded text-cyber-dim uppercase tracking-wider">{u}</span>)}</div>
                                <div className="flex justify-between items-center border-t border-cyber-border pt-4"><span className="font-mono text-xl text-cyber-secondary font-bold">₹{(v.price_range[0]/100000).toFixed(2)} Lakh</span><span className="text-cyber-primary text-xs flex items-center gap-1 group-hover:underline">Visualize & Contract <i className="fas fa-arrow-right"></i></span></div>
                            </div>
                         </div>
                       ))}</div>
                   </div>
                 )}

                 {/* Step 3: VISUALIZER */}
                 {step === 'visualizer' && selectedVehicle && (
                     <div className="animate-fade-in-up flex gap-6 h-[80vh]">
                         <div className="w-1/4 glass-panel border-r border-cyber-border flex flex-col rounded-l-xl overflow-hidden">
                             <div className="p-4 border-b border-cyber-border bg-cyber-dark"><h3 className="font-bold text-white text-sm"><i className="fas fa-paint-brush text-cyber-primary mr-2"></i> Customizer AI</h3></div>
                             <div className="flex-1 overflow-y-auto p-4 space-y-4">{visChatHistory.map((m, i) => (<div key={i} className={`p-3 rounded text-xs ${m.type === 'user' ? 'bg-cyber-primary/20 text-white ml-auto border border-cyber-primary/30' : 'bg-cyber-dark text-cyber-dim mr-auto border border-cyber-border'}`}>{m.text}</div>))}<div ref={visChatEndRef} /></div>
                             <form onSubmit={handleVisualizerChat} className="p-4 border-t border-cyber-border bg-cyber-dark"><div className="flex gap-2"><input className="flex-1 bg-cyber-black border border-cyber-border rounded px-2 py-2 text-xs text-white focus:border-cyber-primary outline-none" placeholder="e.g. Make it red..." value={visChatQuery} onChange={e => setVisChatQuery(e.target.value)} disabled={visualizing} /><button type="submit" disabled={visualizing} className="text-cyber-primary hover:text-white disabled:opacity-50"><i className="fas fa-paper-plane"></i></button></div></form>
                         </div>
                         <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <button onClick={() => setStep('matches')} className="text-cyber-dim hover:text-white flex items-center gap-2"><i className="fas fa-chevron-left"></i> Back</button>
                                <h2 className="text-2xl font-bold text-white">{selectedVehicle.name} <span className="text-cyber-primary">Visualizer</span></h2>
                                <button onClick={handleStartDrafting} disabled={loading} className="bg-cyber-primary text-black px-6 py-2 rounded font-bold hover:bg-white transition-all shadow-neon-blue text-sm uppercase flex items-center gap-2 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-signature"></i>}<span>{loading ? 'Analyzing Template...' : 'Draft Contract'}</span></button>
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-4 overflow-y-auto">{visualizing ? ( Array(4).fill(0).map((_, i) => (<div key={i} className="aspect-video bg-cyber-dark rounded-xl border border-cyber-border animate-pulse flex items-center justify-center flex-col gap-2"><i className="fas fa-magic fa-spin text-3xl text-cyber-primary"></i><span className="text-xs text-cyber-dim">Rendering pixels...</span></div>)) ) : ( generatedImages.length > 0 ? ( generatedImages.map((img, i) => (<div key={i} className="aspect-video rounded-xl overflow-hidden border border-cyber-border group relative"><img src={img} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Generated" /><div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white backdrop-blur">AI Generated</div><button onClick={(e) => { e.stopPropagation(); handleSaveVisual(img); }} disabled={isSavingImg} className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur transition-all ${savedImageIds.has(img) ? 'bg-green-500 text-white' : 'bg-black/50 text-white hover:bg-cyber-primary hover:text-black'}`} title="Save to My Garage">{isSavingImg ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${savedImageIds.has(img) ? 'fa-check' : 'fa-save'}`}></i>}</button></div>)) ) : ( <div className="col-span-full flex items-center justify-center text-cyber-dim">No images generated yet.</div> ) )}</div>
                         </div>
                     </div>
                 )}

                 {/* Step 4: CONTRACT ... */}
                 {step === 'contract' && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up h-[85vh]">
                     
                     {/* LEFT COLUMN: The Printable Contract */}
                     <div className="lg:col-span-2 glass-panel p-2 rounded-xl border border-cyber-border hover:shadow-neon-blue transition-all duration-500 overflow-hidden flex flex-col bg-gray-100">
                       {/* Toolbar */}
                       <div className="bg-white border-b border-gray-200 p-3 flex items-center gap-4 text-xs text-gray-700 rounded-t-lg shadow-sm z-10 sticky top-0">
                           <span className="font-bold text-blue-800 flex items-center gap-1"><i className="fas fa-file-word"></i> Contract.docx</span>
                           <div className="h-4 w-px bg-gray-300 mx-2"></div>
                           <span className="text-gray-500 italic">Read-Only View</span>
                           <div className="ml-auto flex gap-2 items-center">
                               <span className="font-bold text-black hidden md:inline">Jurisdiction:</span>
                               <select 
                                   className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 outline-none hover:border-blue-500 cursor-pointer"
                                   value={contractRegion}
                                   onChange={handleJurisdictionChange}
                                   disabled={isAdaptingContract}
                               >
                                   <option>Delhi NCR</option>
                                   <option>Maharashtra</option>
                                   <option>Karnataka</option>
                                   <option>Telangana</option>
                                   <option>West Bengal</option>
                                   <option>Uttar Pradesh</option>
                                   <option>Bharat Series (BH)</option>
                               </select>
                               {isAdaptingContract && <i className="fas fa-spinner fa-spin text-blue-500"></i>}
                           </div>
                       </div>
                       
                       {/* The Paper Document */}
                       <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                           {/* Endless White Sheet */}
                           <div className="bg-white text-black shadow-lg mx-auto w-full max-w-4xl min-h-screen h-auto p-12 lg:p-16 rounded-sm text-sm leading-7 font-serif border border-gray-200">
                               <div className="[&>p]:mb-4 [&>h3]:text-xl [&>h3]:font-bold [&>h3]:mb-4 [&>h3]:mt-6 [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-1 [&>strong]:font-semibold">
                                   {contractData?.seller_note && (
                                       <div className="mb-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 text-xs italic">
                                           <strong className="block mb-1 not-italic font-bold"><i className="fas fa-comment-dots mr-1"></i> Seller Note:</strong>
                                           "{contractData.seller_note}"
                                       </div>
                                   )}
                                   {/* Render HTML content safely */}
                                   {renderContractContent()}
                               </div>
                           </div>
                       </div>
                     </div>
                     
                     {/* RIGHT COLUMN: Chat & Actions */}
                     <div className="flex flex-col gap-4 h-full">
                        {/* Contract Assistant Chatbot */}
                        <div className="flex-1 glass-panel rounded-xl border border-cyber-border flex flex-col overflow-hidden">
                             <div className="p-3 bg-cyber-dark border-b border-cyber-border flex justify-between items-center">
                                 <h3 className="font-bold text-white text-sm flex items-center gap-2"><i className="fas fa-robot text-cyber-secondary"></i> Contract Assistant</h3>
                                 <span className="text-[10px] bg-cyber-secondary/20 text-cyber-secondary px-2 py-0.5 rounded">AI Powered</span>
                             </div>
                             <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/40">
                                 {contractChatHistory.length === 0 && ( <div className="text-center text-cyber-dim text-xs mt-10"><i className="fas fa-question-circle text-2xl mb-2 opacity-50"></i><p>Ask about specific clauses, penalties, or warranties. I'll highlight the answer in the document.</p></div> )}
                                 {contractChatHistory.map((msg, i) => ( <div key={i} className={`text-xs p-3 rounded-lg ${msg.role === 'user' ? 'bg-cyber-primary/10 border border-cyber-primary/30 text-white ml-4' : 'bg-cyber-dark border border-cyber-border text-cyber-dim mr-4'}`}>{msg.text}</div> ))}
                                 {isContractChatThinking && ( <div className="mr-auto bg-cyber-dark text-cyber-dim text-xs p-3 rounded-lg flex items-center gap-2"><i className="fas fa-circle-notch fa-spin"></i> Analyzing document...</div> )}
                             </div>
                             <form onSubmit={handleContractChat} className="p-3 bg-cyber-dark border-t border-cyber-border">
                                 <div className="flex gap-2">
                                     <input className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-xs text-white focus:border-cyber-secondary outline-none transition-all" placeholder="e.g. Is there a penalty for early exit?" value={contractChatQuery} onChange={e => setContractChatQuery(e.target.value)} disabled={isContractChatThinking} />
                                     <button type="submit" disabled={!contractChatQuery.trim() || isContractChatThinking} className="text-cyber-secondary hover:text-white transition-colors disabled:opacity-50"><i className="fas fa-paper-plane"></i></button>
                                 </div>
                             </form>
                        </div>

                        {/* Ask Seller / Propose Changes */}
                        <div className="glass-panel p-4 rounded-xl border border-cyber-border bg-cyber-dark shrink-0">
                            {showProposalInput ? (
                                <div className="space-y-2 animate-fade-in-up">
                                    <h3 className="font-bold text-white text-xs flex items-center gap-2"><i className="fas fa-pen text-yellow-400"></i> Propose Changes</h3>
                                    <p className="text-[10px] text-cyber-dim">Describe the changes you want. The seller will be notified to revise the contract.</p>
                                    <textarea className="w-full h-20 bg-cyber-black border border-cyber-border rounded p-2 text-white text-xs focus:border-yellow-400 outline-none resize-none" placeholder="E.g., Change warranty duration to 2 years..." value={proposalText} onChange={(e) => setProposalText(e.target.value)} />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowProposalInput(false)} className="flex-1 text-xs text-cyber-dim hover:text-white border border-cyber-border rounded hover:border-white">Cancel</button>
                                        <button onClick={handleProposeChange} disabled={isSendingQuery} className="flex-1 bg-yellow-400 text-black rounded px-2 py-1 text-xs font-bold hover:bg-white flex items-center justify-center gap-1">{isSendingQuery ? <i className="fas fa-spinner fa-spin"></i> : "Send Request"}</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h3 className="font-bold text-white mb-2 text-xs flex items-center gap-2"><i className="fas fa-user-tie text-cyber-primary"></i> Message Seller</h3>
                                    <div className="flex gap-2">
                                        <input className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-white text-xs focus:border-cyber-primary outline-none" placeholder="Official inquiry..." value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                                        <button onClick={handleSendQuery} disabled={!userQuery.trim() || isSendingQuery} className={`px-3 rounded text-xs font-bold transition-all ${querySent ? 'bg-green-500 text-black' : 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary hover:bg-cyber-primary hover:text-black'}`}>{isSendingQuery ? <i className="fas fa-spinner fa-spin"></i> : (querySent ? <i className="fas fa-check"></i> : <i className="fas fa-envelope"></i>)}</button>
                                    </div>
                                    <button onClick={() => setShowProposalInput(true)} className="w-full mt-2 text-[10px] text-yellow-400 hover:text-white underline text-right">Request Contract Revision?</button>
                                </>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="glass-panel p-4 rounded-xl border border-cyber-border shrink-0">
                            <button onClick={analyzeContract} disabled={loading} className="w-full bg-cyber-secondary text-white py-3 rounded-lg font-bold hover:bg-white hover:text-cyber-secondary transition-all shadow-neon-purple uppercase tracking-widest text-xs mb-3 flex justify-center items-center gap-2">{loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-shield-alt"></i>} {loading ? 'Scanning...' : 'Analyze Risk Factors'}</button>
                            <button onClick={() => setStep('visualizer')} className="w-full text-cyber-dim hover:text-white py-2 text-xs">Back to Visualizer</button>
                        </div>
                     </div>
                   </div>
                 )}

                 {/* Step 5: REVIEW */}
                 {step === 'review' && (
                   <div className="flex flex-col items-center animate-scale-in">
                     <div className="w-full max-w-4xl glass-panel rounded-xl border border-cyber-primary shadow-neon-blue overflow-hidden hover:shadow-cyan-500/50 transition-all duration-500">
                        <div className="bg-cyber-primary/10 p-8 text-center border-b border-cyber-primary/30">
                            <div className="inline-block p-4 bg-cyber-black border border-cyber-primary rounded-full mb-4 shadow-neon-blue animate-pulse"><i className="fas fa-check-double text-3xl text-cyber-primary"></i></div>
                            <h2 className="text-3xl font-bold text-white mb-2">Legal Analysis Complete</h2>
                            <p className="text-cyber-primary font-mono text-sm">Risk Vectors Identified</p>
                        </div>
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-cyber-border pb-2"><i className="fas fa-shield-alt text-green-400"></i> Obligations</h3>
                                <ul className="space-y-3">{analysis?.obligations?.length > 0 ? analysis.obligations.map((o: string, i: number) => <li key={i} className="text-sm text-cyber-dim bg-cyber-dark p-3 rounded border-l-2 border-green-500">{o}</li>) : <p className="text-sm text-cyber-dim italic">No specific obligations flagged.</p>}</ul>
                            </div>
                            <div>
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2 border-b border-cyber-border pb-2"><i className="fas fa-exclamation-circle text-cyber-accent"></i> Fees & Penalties</h3>
                                 <ul className="space-y-3">{analysis?.fees_penalties?.length > 0 ? analysis.fees_penalties.map((o: string, i: number) => <li key={i} className="text-sm text-cyber-dim bg-cyber-dark p-3 rounded border-l-2 border-cyber-accent">{o}</li>) : <p className="text-sm text-cyber-dim italic">No hidden fees detected.</p>}</ul>
                            </div>
                        </div>
                        
                        {/* NEW: Seller Query Section in Analysis */}
                        <div className="p-8 bg-cyber-dark border-t border-cyber-border">
                            <h3 className="font-bold text-white mb-2 text-sm flex items-center gap-2"><i className="fas fa-question-circle text-yellow-400"></i> Request Modification</h3>
                            <p className="text-xs text-cyber-dim mb-3">Found a risk? Request a change to the contract clauses. This will flag the contract for revision by the seller.</p>
                            <div className="flex gap-2">
                                <input 
                                    className="flex-1 bg-cyber-black border border-cyber-border rounded px-3 py-2 text-white text-xs focus:border-yellow-400 outline-none" 
                                    placeholder="e.g. Is the 'Early Termination' fee negotiable?" 
                                    value={analysisQuery} 
                                    onChange={(e) => setAnalysisQuery(e.target.value)} 
                                />
                                <button 
                                    onClick={handleSendAnalysisQuery} 
                                    disabled={!analysisQuery.trim() || isSendingAnalysisQuery} 
                                    className={`px-4 rounded text-xs font-bold transition-all ${analysisQuerySent ? 'bg-green-500 text-black' : 'bg-yellow-400/20 text-yellow-400 border border-yellow-400 hover:bg-yellow-400 hover:text-black'}`}
                                >
                                    {isSendingAnalysisQuery ? <i className="fas fa-spinner fa-spin"></i> : (analysisQuerySent ? "Sent" : "Request Revision")}
                                </button>
                            </div>
                            
                            {/* Display latest replies related to this vehicle if any */}
                            {myActivity.queries.filter(q => q.vehicleId === selectedVehicle?.id && q.reply).length > 0 && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs font-bold text-white">Recent Replies:</p>
                                    {myActivity.queries.filter(q => q.vehicleId === selectedVehicle?.id && q.reply).map(q => (
                                        <div key={q.id} className="bg-cyber-black p-3 rounded border border-cyber-border text-xs">
                                            <p className="text-cyber-dim italic mb-1">" {q.message} "</p>
                                            <p className="text-green-400 font-bold"><i className="fas fa-reply mr-1"></i> {q.reply}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-cyber-black/50 p-6 border-t border-cyber-border flex justify-center gap-4">
                            <button onClick={() => setStep('contract')} className="text-cyber-dim hover:text-white px-6 py-2 uppercase text-sm tracking-wider">Back to Contract</button>
                            <button onClick={handleDigitalSign} disabled={isSigning} className="bg-green-500 text-black px-8 py-3 rounded font-bold hover:bg-white transition-all shadow-neon-green uppercase tracking-widest hover:scale-105 flex items-center gap-2">{isSigning ? <><i className="fas fa-spinner fa-spin"></i> Mining Block...</> : 'Sign Digitally'}</button>
                        </div>
                     </div>
                   </div>
                 )}

                 {/* Step 6: RECEIPT ... */}
                 {step === 'receipt' && receipt && (
                     <div className="flex flex-col items-center justify-center animate-scale-in">
                         <div className="w-full max-w-2xl bg-white text-black rounded-lg shadow-2xl overflow-hidden relative">
                             {/* Receipt Header */}
                             <div className="bg-green-600 p-6 text-white text-center relative overflow-hidden">
                                 <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{backgroundImage: 'radial-gradient(circle, #fff 2px, transparent 2px)', backgroundSize: '20px 20px'}}></div>
                                 <i className="fas fa-check-circle text-6xl mb-4 animate-bounce"></i>
                                 <h2 className="text-3xl font-bold tracking-wider">CONTRACT SIGNED</h2>
                                 <p className="font-mono text-sm opacity-80 mt-1">BLOCKCHAIN VERIFIED</p>
                             </div>
                             <div className="p-8 space-y-6">
                                 <div className="text-center border-b border-gray-200 pb-6"><p className="text-gray-500 text-sm uppercase tracking-wide mb-1">Vehicle Model</p><h3 className="text-2xl font-bold">{selectedVehicle?.name}</h3><p className="text-gray-600">{selectedVehicle?.trim}</p></div>
                                 <div className="bg-gray-100 p-4 rounded font-mono text-xs break-all border border-gray-300"><div className="mb-2"><span className="font-bold text-gray-700">TX HASH:</span><div className="text-blue-600">{receipt.tx_hash}</div></div><div className="flex justify-between"><span><span className="font-bold text-gray-700">BLOCK:</span> {receipt.block_number}</span><span><span className="font-bold text-gray-700">GAS:</span> {receipt.gas_used}</span></div><div className="mt-2"><span className="font-bold text-gray-700">TIMESTAMP:</span> {new Date(receipt.timestamp).toLocaleString()}</div></div>
                                 <div className="bg-blue-50 border border-blue-200 p-4 rounded text-center"><h4 className="font-bold text-blue-800 mb-2"><i className="fas fa-user-tie mr-2"></i> What Happens Next?</h4><p className="text-sm text-blue-700">A Teckion representative has been notified of your digital signature. They will contact you within 24 hours to arrange final delivery and key handover.</p></div>
                             </div>
                             <div className="bg-gray-50 p-6 flex justify-center border-t border-gray-200"><button onClick={() => setActiveTab('garage')} className="bg-black text-white px-8 py-3 rounded font-bold hover:bg-gray-800 transition-all uppercase tracking-widest shadow-lg">Go to My Garage</button></div>
                         </div>
                     </div>
                 )}
             </>
         )}
       </main>
    </div>
  );
};

export default UserDashboard;
