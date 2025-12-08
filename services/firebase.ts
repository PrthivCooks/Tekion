
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc,
  increment,
  addDoc,
  writeBatch,
  deleteDoc
} from "firebase/firestore";
import { User, Seller, Role, Vehicle, Contract, AnalyticsData, UserQuery, SavedVisual, BlockchainReceipt, InsurancePlan } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyA6EupyhlQs1up2s6S-v4UpCD3OEoj8KGw",
  authDomain: "teckion-7d2d8.firebaseapp.com",
  databaseURL: "https://teckion-7d2d8-default-rtdb.firebaseio.com",
  projectId: "teckion-7d2d8",
  storageBucket: "teckion-7d2d8.firebasestorage.app",
  messagingSenderId: "641411833596",
  appId: "1:641411833596:web:f60baa05481b68cc064179",
  measurementId: "G-0CWQFLC2T6"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Auth & User Management ---

export const getUserProfile = async (uid: string): Promise<User | Seller | null> => {
  let docRef = doc(db, "users", uid);
  let docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as User;
  }

  docRef = doc(db, "sellers", uid);
  docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as Seller;
  }

  if (uid === 'admin_1') { 
      return { uid, email: 'admin@teckion.com', name: 'Admin', role: 'admin', created_at: new Date().toISOString() };
  }

  // Mock Fallback for demo purposes if ID starts with 'u' or 's' but not found in DB (for hybrid mock/real state)
  if (uid.startsWith('u')) {
      return { uid, email: 'mockuser@example.com', name: 'Mock User', role: 'user', created_at: new Date().toISOString(), phone: '555-0123', address: '123 Cyber Lane', interests: 'EVs, Tech' };
  }

  return null;
};

export const registerUserInFirestore = async (uid: string, data: any, role: Role) => {
  const collectionName = role === 'seller' ? 'sellers' : 'users';
  await setDoc(doc(db, collectionName, uid), {
    ...data,
    uid,
    role,
    created_at: new Date().toISOString()
  });
};

export const updateUserProfile = async (uid: string, role: Role, data: Partial<User | Seller>) => {
    const collectionName = role === 'seller' ? 'sellers' : 'users';
    const ref = doc(db, collectionName, uid);
    await updateDoc(ref, data);
};

// --- Mock Data ---

const DEFAULT_INSURANCE: InsurancePlan[] = [
    { id: 'ins1', provider: 'HDFC Ergo', name: 'Titanium Zero Dep', premium: 45000, type: 'Zero-Dep', addons: ['Engine Protect', 'Key Loss', 'RTI'], coverage_details: '100% coverage on metal and plastic parts.' },
    { id: 'ins2', provider: 'ICICI Lombard', name: 'Pay-As-You-Drive', premium: 22000, type: 'Pay-As-You-Drive', addons: ['Roadside Assistance'], coverage_details: 'Ideal for low usage. Premium based on KM driven.' },
    { id: 'ins3', provider: 'Digit', name: 'Standard Comprehensive', premium: 30000, type: 'Comprehensive', addons: ['Personal Accident'], coverage_details: 'Standard own damage + third party coverage.' }
];

const MOCK_VEHICLES: Vehicle[] = [
  { 
    id: 'v1', name: 'Terra Explorer X', trim: 'Alpine Edition', drive: 'AWD', seats: 5,
    use_cases: ['Trekking', 'Off-road', 'Adventure', 'Dogs', 'Camping', 'Mountain'], 
    price_range: [3600000, 4200000], // ~36-42 Lakhs
    f_and_i: ['Adventure Pack'], 
    last_updated: '2023-10-01', image_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
    visual_desc: 'Rugged silver SUV with roof rack, mud tires, and high ground clearance',
    contract_template: `<h3>OFF-ROAD VEHICLE SALES AGREEMENT</h3><br><p><b>1. THE PARTIES</b><br>Buyer: {{buyer_name}}<br>Seller: Teckion Auto</p><br><p><b>2. UNIT DESCRIPTION</b><br>Model: {{vehicle_name}} (Terra Explorer)<br>Trim: Alpine Edition</p><br><p><b>3. OFF-ROAD DISCLAIMER</b><br>Seller is not liable for damage on non-paved roads. Warranty covers powertrain only. Use of 4WD mode on dry pavement voids warranty.</p>`,
    insurance_options: DEFAULT_INSURANCE
  },
  { 
    id: 'v2', name: 'CityGlider EV', trim: 'Urban Prime', drive: 'FWD', seats: 4,
    use_cases: ['City Commute', 'Eco-Friendly', 'Budget', 'Small Family', 'Student', 'Efficient'], 
    price_range: [2250000, 2600000], // ~22.5-26 Lakhs
    f_and_i: ['Green Tax Credit'], 
    last_updated: '2023-10-02', image_url: 'https://images.unsplash.com/photo-1593055498207-6c3d9a5441b4?auto=format&fit=crop&q=80&w=800',
    visual_desc: 'Compact white electric hatchback, futuristic rounded design, aerodynamic wheels',
    contract_template: `<h3>EV PURCHASE AGREEMENT</h3><br><p><b>1. THE PARTIES</b><br>Buyer: {{buyer_name}}<br>Seller: Teckion Auto</p><br><p><b>2. VEHICLE</b><br>Model: {{vehicle_name}}<br>VIN: [VIN]</p><br><p><b>3. BATTERY LEASE</b><br>The battery is sold with the vehicle (not leased). 8-year manufacturer warranty applies to the HV battery.</p>`,
    insurance_options: [DEFAULT_INSURANCE[1], DEFAULT_INSURANCE[2]]
  },
  { 
    id: 'v3', name: 'Luxor S-Class', trim: 'Executive', drive: 'RWD', seats: 5,
    use_cases: ['Luxury Preference', 'Business', 'Comfort', 'Clients', 'Highway', 'Status'], 
    price_range: [8800000, 11000000], // ~88 Lakhs - 1.1 Cr
    f_and_i: ['Executive Lease'], 
    last_updated: '2023-10-03', image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=800',
    visual_desc: 'Black luxury sedan, chrome accents, long wheelbase, tinted windows',
    contract_template: `<h3>LUXURY VEHICLE PURCHASE AGREEMENT</h3><br><p><b>1. THE PARTIES</b><br>Client: {{buyer_name}}<br>Seller: Teckion Luxury</p><br><p><b>2. VEHICLE</b><br>Model: {{vehicle_name}}</p><br><p><b>3. CONCIERGE SERVICE</b><br>Includes 3 years of scheduled maintenance and valet pickup.</p>`,
    insurance_options: [DEFAULT_INSURANCE[0]]
  },
  {
      id: 'v4', name: 'FamilyHauler 5000', trim: 'Platinum Minivan', drive: 'AWD', seats: 8,
      use_cases: ['Family', 'Safety-First', 'Roadtrips', 'Kids', 'Pets', '7 Seater', '8 Seater', 'Space'], 
      price_range: [3200000, 3800000], // ~32-38 Lakhs
      f_and_i: ['Family Protection Plan'],
      last_updated: '2023-10-04', image_url: 'https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Blue minivan, sliding doors, roof rails, spacious interior visibility',
      contract_template: `<h3>FAMILY VEHICLE SALE</h3><br><p><b>1. THE PARTIES</b><br>Buyer: {{buyer_name}}<br>Seller: Teckion Auto</p><br><p><b>2. SAFETY INSPECTION</b><br>Certified Child Seat Anchors verified. 5-Star Safety Rating certificate attached.</p>`,
      insurance_options: DEFAULT_INSURANCE
  },
  {
      id: 'v5', name: 'SpeedDemon GT', trim: 'Track Pack', drive: 'RWD', seats: 2,
      use_cases: ['Performance', 'Weekend', 'Luxury', 'Solo', 'Sport', 'Fast'], 
      price_range: [5500000, 6500000], // ~55-65 Lakhs
      f_and_i: ['Tire Insurance'],
      last_updated: '2023-10-05', image_url: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Red sports coupe, low profile, spoiler, aggressive front grille',
      contract_template: `<h3>PERFORMANCE VEHICLE WAIVER</h3><br><p><b>1. PARTIES</b><br>Buyer: {{buyer_name}}</p><br><p><b>2. TRACK USE</b><br>Manufacturer warranty is VOID if vehicle is used on a competitive race track.</p>`,
      insurance_options: [DEFAULT_INSURANCE[0]]
  },
  {
      id: 'v6', name: 'WorkHorse 1500', trim: 'Heavy Duty', drive: '4WD', seats: 3,
      use_cases: ['Work', 'Towing', 'Off-road', 'Cargo', 'Truck', 'Construction'], 
      price_range: [3500000, 4500000], // ~35-45 Lakhs
      f_and_i: ['Commercial Loan'],
      last_updated: '2023-10-06', image_url: 'https://images.unsplash.com/photo-1566008885218-90abf9200ddb?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'White pickup truck, large bed, towing mirrors, rugged bumper',
      contract_template: `<h3>COMMERCIAL VEHICLE SALE</h3><br><p><b>1. BUYER:</b> {{buyer_name}}</p><br><p><b>2. TOWING CAPACITY:</b> Verified at 12,000 lbs. Buyer acknowledges commercial registration requirements.</p>`,
      insurance_options: DEFAULT_INSURANCE
  },
  {
      id: 'v7', name: 'Compacto Z', trim: 'Sport', drive: 'FWD', seats: 4,
      use_cases: ['City Commute', 'Budget', 'Student', 'Solo', 'Efficient', 'Cheap'], 
      price_range: [1200000, 1600000], // ~12-16 Lakhs
      f_and_i: ['First Time Buyer Program'],
      last_updated: '2023-10-07', image_url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Small yellow hatchback, sporty rims, compact design',
      contract_template: `<h3>STANDARD SALE AGREEMENT</h3><br><p><b>1. PARTIES</b><br>Buyer: {{buyer_name}}</p><br><p><b>2. AS-IS SALE</b><br>This economy vehicle is sold with standard state mandated warranties only.</p>`,
      insurance_options: [DEFAULT_INSURANCE[1], DEFAULT_INSURANCE[2]]
  },
  {
      id: 'v8', name: 'RidgeClimber', trim: 'Summit', drive: '4WD', seats: 5,
      use_cases: ['Trekking', 'Adventure', 'Camping', 'Dogs', 'Mud', 'Rocky'], 
      price_range: [2800000, 3400000], // ~28-34 Lakhs
      f_and_i: ['Gap Insurance'],
      last_updated: '2023-10-08', image_url: 'https://images.unsplash.com/photo-1532588365922-db13a30cb23d?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Green boxy SUV, vintage style, spare tire on back, white roof',
      contract_template: `<h3>ADVENTURE VEHICLE TERMS</h3><br><p><b>1. BUYER:</b> {{buyer_name}}</p><br><p><b>2. MODIFICATIONS</b><br>Any aftermarket lift kits installed by Buyer post-sale may void suspension warranty.</p>`,
      insurance_options: DEFAULT_INSURANCE
  },
  {
      id: 'v9', name: 'VoltStream SUV', trim: 'Long Range', drive: 'AWD', seats: 7,
      use_cases: ['Family', 'Eco-Friendly', 'Tech-Forward', 'Roadtrips', '7 Seater', 'Electric'], 
      price_range: [4800000, 5800000], // ~48-58 Lakhs
      f_and_i: ['Tech Lease'],
      last_updated: '2023-10-09', image_url: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Silver aerodynamic SUV, flush door handles, panoramic glass roof',
      contract_template: `<h3>DIGITAL SALES CONTRACT</h3><br><p><b>1. BUYER:</b> {{buyer_name}}</p><br><p><b>2. SOFTWARE LICENSE</b><br>Vehicle software is licensed, not sold. OTA updates provided for 5 years.</p>`,
      insurance_options: DEFAULT_INSURANCE
  },
  {
      id: 'v10', name: 'SafeGuard Sentinel', trim: 'Armored Lite', drive: 'AWD', seats: 4,
      use_cases: ['Safety-First', 'Luxury', 'Security', 'VIP', 'City', 'Bulletproof'], 
      price_range: [12000000, 15000000], // ~1.2-1.5 Cr
      f_and_i: ['Security Package'],
      last_updated: '2023-10-10', image_url: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&q=80&w=800',
      visual_desc: 'Matte black large SUV, reinforced glass, run-flat tires, imposing stance',
      contract_template: `<h3>SPECIALTY VEHICLE AGREEMENT</h3><br><p><b>1. BUYER:</b> {{buyer_name}}</p><br><p><b>2. ARMORING</b><br>Ballistic protection level B4 certified. Handling characteristics differ from standard models.</p>`,
      insurance_options: [DEFAULT_INSURANCE[0]]
  }
];

const MOCK_ANALYTICS: AnalyticsData = {
  family_count: 92,
  commute_count: 60,
  trekking_count: 48,
  luxury_count: 25,
  budget_count: 35,
  safety_count: 44,
  total_visits: 1240,
  total_revenue: 35000000, // ~3.5 Cr
  conversion_rate: 18.4,
  pending_deals: 5,
  trends: [
    { date: 'Mon', inquiries: 12, revenue: 1200000 },
    { date: 'Tue', inquiries: 19, revenue: 2000000 },
    { date: 'Wed', inquiries: 15, revenue: 1400000 },
    { date: 'Thu', inquiries: 22, revenue: 3600000 },
    { date: 'Fri', inquiries: 30, revenue: 4400000 },
    { date: 'Sat', inquiries: 45, revenue: 6400000 },
    { date: 'Sun', inquiries: 38, revenue: 5200000 },
  ]
};

const EMPTY_ANALYTICS: AnalyticsData = {
  family_count: 0, commute_count: 0, trekking_count: 0, luxury_count: 0, budget_count: 0, safety_count: 0,
  total_visits: 0, total_revenue: 0, conversion_rate: 0, pending_deals: 0,
  trends: [
    { date: 'Mon', inquiries: 0, revenue: 0 },
    { date: 'Tue', inquiries: 0, revenue: 0 },
    { date: 'Wed', inquiries: 0, revenue: 0 },
    { date: 'Thu', inquiries: 0, revenue: 0 },
    { date: 'Fri', inquiries: 0, revenue: 0 },
    { date: 'Sat', inquiries: 0, revenue: 0 },
    { date: 'Sun', inquiries: 0, revenue: 0 },
  ]
};

const MOCK_QUERIES: UserQuery[] = [
    { id: 'q1', userId: 'u1', userName: 'John Doe', sellerId: 's1', vehicleId: 'v1', vehicleName: 'Terra Explorer X', message: 'Does the warranty cover off-road suspension damage?', status: 'open', created_at: '2023-10-20T10:00:00Z' },
    { id: 'q2', userId: 'u2', userName: 'Jane Smith', sellerId: 's1', vehicleId: 'v2', vehicleName: 'CityGlider EV', message: 'Is the home charger included in the price?', status: 'closed', reply: 'Yes, a Level 2 home charger is included.', created_at: '2023-10-19T14:30:00Z' },
    { id: 'q3', userId: 'u3', userName: 'Bob Johnson', sellerId: 's1', vehicleId: 'v4', vehicleName: 'FamilyHauler 5000', message: 'Can I add a tow hitch for a small trailer?', status: 'open', created_at: '2023-10-21T09:15:00Z' }
];

const MOCK_CONTRACTS: Contract[] = [
    { id: 'c1', userId: 'u5', sellerId: 's1', vehicleId: 'v3', vehicleName: 'Luxor S-Class', contract_html: '<p>Signed...</p>', contract_summary: 'Luxury Lease', highlighted_clauses: {}, status: 'accepted', created_at: '2023-10-15', blockchain_receipt: { tx_hash: '0x123...abc', block_number: 123456, timestamp: '2023-10-15', gas_used: 21000, contract_address: '0x789...xyz' } },
    { id: 'c2', userId: 'u6', sellerId: 's1', vehicleId: 'v7', vehicleName: 'Compacto Z', contract_html: '<p>Pending...</p>', contract_summary: 'Standard Sale', highlighted_clauses: {}, status: 'pending', created_at: '2023-10-21' }
];

const MOCK_VISUALS: SavedVisual[] = [
    { id: 'sv1', userId: 'u1', vehicleId: 'v1', vehicleName: 'Terra Explorer X', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800', prompt: 'In the snow', created_at: '2023-10-22' }
];

// --- Data Access ---

export const fetchVehicles = async (useMock: boolean): Promise<Vehicle[]> => {
  if (useMock) return MOCK_VEHICLES;
  
  const q = query(collection(db, "vehicles"));
  const querySnapshot = await getDocs(q);
  // If no vehicles in DB, return MOCK_VEHICLES temporarily so user isn't staring at blank screen
  if (querySnapshot.empty) {
      console.log("No vehicles in Firestore, falling back to mock temporarily.");
      return MOCK_VEHICLES;
  }
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
};

export const fetchAnalytics = async (useMock: boolean): Promise<AnalyticsData> => {
  if (useMock) return MOCK_ANALYTICS;

  const docRef = doc(db, "analytics", "usage");
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return { ...EMPTY_ANALYTICS, ...data };
  }
  return EMPTY_ANALYTICS;
};

export const updateAnalytics = async (category: string) => {
  const docRef = doc(db, "analytics", "usage");
  
  const keyMap: Record<string, string> = {
    'Family': 'family_count',
    'City Commute': 'commute_count',
    'Trekking': 'trekking_count',
    'Luxury Preference': 'luxury_count',
    'Budget-Constrained': 'budget_count',
    'Safety-First': 'safety_count'
  };

  const field = keyMap[category];
  if (field) {
    try {
      await updateDoc(docRef, { [field]: increment(1), total_visits: increment(1) });
    } catch (e) {
      await setDoc(docRef, { [field]: 1, total_visits: 1 }, { merge: true });
    }
  }
};

export const saveVehicle = async (vehicle: Omit<Vehicle, 'id' | 'last_updated'> & { id?: string }) => {
    if (vehicle.id) {
        const ref = doc(db, "vehicles", vehicle.id);
        await setDoc(ref, { ...vehicle, last_updated: new Date().toISOString() }, { merge: true });
    } else {
        const newDocRef = doc(collection(db, "vehicles"));
        await setDoc(newDocRef, {
            ...vehicle,
            last_updated: new Date().toISOString()
        });
    }
};

export const seedDatabase = async () => {
    const batch = writeBatch(db);
    MOCK_VEHICLES.forEach(v => {
        // We use the ID from the mock data to ensure we overwrite existing mock entries rather than creating duplicates
        const docRef = doc(db, "vehicles", v.id); 
        batch.set(docRef, { ...v, last_updated: new Date().toISOString() });
    });
    await batch.commit();
};

export const saveContract = async (contract: Omit<Contract, 'id' | 'created_at'>): Promise<string> => {
    const newDocRef = doc(collection(db, "contracts"));
    await setDoc(newDocRef, {
        ...contract,
        created_at: new Date().toISOString()
    });
    return newDocRef.id;
};

export const updateContractStatus = async (contractId: string, status: Contract['status'], receipt?: BlockchainReceipt, updates?: Partial<Contract>) => {
    const ref = doc(db, "contracts", contractId);
    const data: any = { status, ...updates };
    if (receipt) {
        data.blockchain_receipt = receipt;
    }
    await updateDoc(ref, data);
};

export const saveUserQuery = async (queryData: { userId: string, userName: string, sellerId: string, vehicleId: string, vehicleName: string, message: string }) => {
    const queriesRef = collection(db, "queries");
    await addDoc(queriesRef, {
        ...queryData,
        status: 'open',
        created_at: new Date().toISOString()
    });
};

export const saveVisual = async (visualData: Omit<SavedVisual, 'id' | 'created_at'>) => {
    const visualRef = collection(db, "saved_visuals");
    await addDoc(visualRef, {
        ...visualData,
        created_at: new Date().toISOString()
    });
};

export const deleteDocument = async (collectionName: string, id: string) => {
    await deleteDoc(doc(db, collectionName, id));
};

export const fetchUserActivity = async (userId: string, useMock: boolean) => {
    if (useMock) {
        // Return dummy data associated with "mock" user or just general mocks filtered
        return {
            contracts: MOCK_CONTRACTS.filter(c => c.userId === userId || c.userId === 'u5' || c.userId === 'u6'), // Simulating data
            queries: MOCK_QUERIES.filter(q => q.userId === userId || q.userId === 'u1' || q.userId === 'u2'),
            savedVisuals: MOCK_VISUALS
        };
    }
    
    const qContracts = query(collection(db, "contracts"), where("userId", "==", userId));
    const qQueries = query(collection(db, "queries"), where("userId", "==", userId));
    const qVisuals = query(collection(db, "saved_visuals"), where("userId", "==", userId));

    const [snapC, snapQ, snapV] = await Promise.all([getDocs(qContracts), getDocs(qQueries), getDocs(qVisuals)]);

    return {
        contracts: snapC.docs.map(d => ({id: d.id, ...d.data()}) as Contract),
        queries: snapQ.docs.map(d => ({id: d.id, ...d.data()}) as UserQuery),
        savedVisuals: snapV.docs.map(d => ({id: d.id, ...d.data()}) as SavedVisual)
    };
}

export const fetchSellerInteractions = async (useMock: boolean) => {
    if (useMock) {
        return { queries: MOCK_QUERIES, contracts: MOCK_CONTRACTS };
    }
    
    // In real app, query where sellerId == currentUser.uid
    const qQueries = query(collection(db, "queries")); 
    const qContracts = query(collection(db, "contracts"));

    const [snapQ, snapC] = await Promise.all([getDocs(qQueries), getDocs(qContracts)]);
    
    return {
        queries: snapQ.docs.map(d => ({id: d.id, ...d.data()}) as UserQuery),
        contracts: snapC.docs.map(d => ({id: d.id, ...d.data()}) as Contract)
    };
};

export const respondToQuery = async (queryId: string, reply: string) => {
    const ref = doc(db, "queries", queryId);
    try {
        await updateDoc(ref, { reply, status: 'closed' });
        return true;
    } catch(e) {
        console.log("Error updating query:", e);
        return true; 
    }
};
