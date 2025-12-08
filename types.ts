
export type Role = 'user' | 'seller' | 'admin';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
  // New Profile Fields
  phone?: string;
  address?: string;
  interests?: string; // Comma separated string for UI simplicity
}

export interface Seller extends User {
  role: 'seller';
  dealership_name: string;
  // New Profile Fields
  emp_id?: string;
  designation?: string;
}

export interface InsurancePlan {
  id: string;
  provider: string; // e.g., HDFC Ergo, ICICI Lombard
  name: string; // e.g., "Gold Shield Zero Dep"
  premium: number; // Annual cost
  type: 'Comprehensive' | 'Third-Party' | 'Zero-Dep' | 'Pay-As-You-Drive';
  addons: string[]; // e.g., ["Engine Protect", "RTI", "Consumables"]
  coverage_details: string;
}

export interface Vehicle {
  id: string;
  name: string;
  trim: string;
  drive: string;
  use_cases: string[];
  price_range: [number, number];
  f_and_i: string[];
  image_url?: string;
  last_updated: string;
  contract_template?: string;
  visual_desc?: string;
  seats: number; 
  insurance_options?: InsurancePlan[]; // New field
}

export interface BlockchainReceipt {
  tx_hash: string;
  block_number: number;
  timestamp: string;
  gas_used: number;
  contract_address: string;
}

export interface Contract {
  id: string;
  userId: string;
  sellerId: string;
  vehicleId: string;
  vehicleName: string;
  contract_html: string;
  contract_summary: string;
  highlighted_clauses: any;
  status: "pending" | "reviewed" | "accepted" | "rejected" | "needs_changes";
  change_request_message?: string;
  seller_note?: string; // New field for negotiation messages
  blockchain_receipt?: BlockchainReceipt;
  created_at: string;
}

export interface UserQuery {
  id: string;
  userId: string;
  userName: string; // Added userName
  sellerId: string;
  vehicleId: string;
  vehicleName: string;
  message: string;
  reply?: string;
  status: 'open' | 'closed';
  created_at: string;
}

export interface SavedVisual {
  id: string;
  userId: string;
  vehicleId: string;
  vehicleName: string;
  imageUrl: string;
  prompt: string;
  created_at: string;
}

export interface AnalyticsData {
  family_count: number;
  commute_count: number;
  trekking_count: number;
  luxury_count: number;
  budget_count: number;
  safety_count: number;
  total_visits: number;
  total_revenue: number;
  conversion_rate: number;
  pending_deals: number;
  trends: { date: string; inquiries: number; revenue: number }[];
}

export interface IntentResult {
  lifestyle_patterns: string[];
  category: string;
  recommended_features: string[];
  detected_budget?: number; // In Rupees
  min_seats?: number;
}

export interface AuthValidationResult {
  is_valid: boolean;
  reasons: string[];
  risk_score: number;
  recommended_fix: string;
}
