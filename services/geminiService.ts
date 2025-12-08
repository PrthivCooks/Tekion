
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AuthValidationResult, IntentResult, InsurancePlan } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' }); 

const MODEL_FLASH = 'gemini-2.5-flash';
const MODEL_IMAGES = 'gemini-2.5-flash-image';

// Helper to strip markdown code blocks if the model returns them
const cleanHtml = (text: string) => {
    if (!text) return "";
    // Remove ```html at start and ``` at end, or just ```
    let clean = text.replace(/```html/gi, '').replace(/```/g, '');
    return clean.trim();
}

// Extracted from the "Pan-India Automotive Regulatory Analysis and Contract Toolkit" PDF 
// AND "How to Read and Understand Your Vehicle Purchase Agreement" Article
const REGULATORY_CONTEXT = `
  CRITICAL REGULATORY CONTEXT (INDIA 2025):
  1. DELHI NCR:
     - Diesel vehicles >10 years and Petrol >15 years are BANNED (NGT Order).
     - Contracts MUST include an "Early Termination" or "Asset Relocation" clause for end-of-life.
     - Depreciation schedules must be accelerated (legal life < mechanical life).
  2. MAHARASHTRA:
     - Corporate Registration Tax is FLAT 20% (vs ~11-13% for individuals).
     - Contracts for corporate leases must account for this 7-9% cost differential.
     - 1% Cess on CNG vehicles.
  3. KARNATAKA:
     - High Road Tax (13-18% + 11% Infra Cess).
     - NEW 2025 RULE: 10% Lifetime Tax on EVs costing > ₹25 Lakh (Subsidy Sunset).
     - Strict "30-Day Rule" for out-of-state vehicles; requires "Transfer Clause" in contracts.
  4. TELANGANA:
     - 2% Surcharge on second vehicle registered in same name.
     - 100% Road Tax Exemption continues for EVs (unlike Karnataka).
  5. UTTAR PRADESH (UP):
     - Hybrid/EV waivers are conditional/volatile.
     - Scrappage Policy: 75% tax exemption on arrears; 15-25% rebate on new vehicle road tax against Scrappage Certificate (CoD).
  6. WEST BENGAL:
     - Tax based on Engine CC slabs, not ad valorem.
     - Option for 5-Year Tax vs Lifetime Tax. Contracts must track "Tax Renewal" events if 5-year option chosen.
  7. GENERAL / BHARAT SERIES (BH):
     - "Handling Charges" by dealers are ILLEGAL (SC Ruling). Contracts must have a warranty against hidden fees.
     - BH Series: Available for employees with offices in 4+ states. Tax levied every 2 years (8-12%). Eliminates re-registration cost on transfer.

  VEHICLE PURCHASE AGREEMENT BEST PRACTICES:
  A. TRUTH-IN-LENDING (If Financing):
     - Must disclose: APR, Finance Charge, Amount Financed, Total Payments.
  B. ITEMIZED COMPONENTS (Purchase & Sale):
     - Selling Price (Cash Price).
     - Down Payment (Cash + Trade-in Allowance - Payoff).
     - Paid to Others (Taxes, Title, Registration).
     - Total Amount Financed.
  C. TRADE-IN CERTIFICATION (Buyer's Reps):
     - Buyer certifies: Title not salvaged, Airbags intact, Odometer not modified, Emissions not modified.
  D. WARRANTY DISCLAIMER:
     - Explicit "AS-IS" statement if Dealer provides no warranty.
     - Reference Manufacturer Warranty availability.
     - Doc Fee Notice explaining the documentary fee.
`;

export const queryAnalyticsChatbot = async (question: string, contextData: any) => {
    const safeContext = {
        summary: "Automotive Sales Dashboard",
        stats: contextData.analytics || {},
        inventory_count: contextData.inventory_summary?.total_vehicles || 0
    };

    const prompt = `
      System: You are an AI assistant for a car dealership dashboard.
      Data Context: ${JSON.stringify(safeContext)}
      User Question: "${question}"
      Instructions: Answer concisely (under 50 words) based strictly on the Data Context.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
        });
        return response.text || "No response generated.";
    } catch (e) {
        console.error("Chatbot Error:", e);
        return "I'm having trouble connecting to the neural network right now. Please try again.";
    }
};

export const queryContractAssistant = async (question: string, contractText: string) => {
    // We clean the text for the prompt to save context, but we need the exact phrase for highlighting
    const prompt = `
      System: You are a Legal Assistant helping a car buyer understand their contract.
      Contract Text: """${contractText}"""
      User Question: "${question}"
      
      Task:
      1. Answer the user's question clearly based on the contract text.
      2. Identify a SHORT, UNIQUE sentence or phrase (max 10-15 words) from the contract text that directly supports your answer. 
      3. CRITICAL: The 'citation_quote' MUST exist character-for-character in the text so it can be highlighted. Do not paraphrase the quote.
      
      Output JSON: { "answer": string, "citation_quote": string }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        answer: { type: Type.STRING },
                        citation_quote: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { answer: "I couldn't analyze the document at this moment.", citation_quote: "" };
    }
}

export const verifyRevisionCompliance = async (oldText: string, newText: string, request: string) => {
    const prompt = `
      Task: Verify Contract Compliance.
      
      Original Request from Buyer: "${request}"
      
      New Contract Text: 
      """${newText}"""
      
      Instructions:
      1. Analyze if the New Contract Text has been modified to reasonably satisfy the Buyer's request compared to standard automotive terms.
      2. Output JSON: { "satisfied": boolean, "reason": string }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        satisfied: { type: Type.BOOLEAN },
                        reason: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { satisfied: true, reason: "AI Verification Skipped." };
    }
}

export const validateAccountCreation = async (
  name: string,
  email: string,
  role: string,
  dealershipName?: string
): Promise<AuthValidationResult> => {
  const prompt = `
    Task: Validate user registration.
    Inputs: Name="${name}", Email="${email}", Role="${role}", Dealership="${dealershipName}".
    Rules: 1. Email must be valid format. 2. If Role is 'seller', Dealership must be > 3 chars.
    Output JSON: { is_valid: boolean, reasons: string[], risk_score: number (0-1), recommended_fix: string }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: prompt,
      config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                is_valid: { type: Type.BOOLEAN },
                reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                risk_score: { type: Type.NUMBER },
                recommended_fix: { type: Type.STRING }
            }
          }
      }
    });
    
    if (response.text) return JSON.parse(response.text);
    return { is_valid: true, reasons: [], risk_score: 0, recommended_fix: "" };
  } catch (error) {
    return { is_valid: true, reasons: ["AI Validation bypassed"], risk_score: 0, recommended_fix: "" }; 
  }
};

export const analyzeIntent = async (userInput: string): Promise<IntentResult> => {
  const prompt = `
    Analyze User Input: "${userInput}"
    Task: 
    1. Classify into ONE category: Family, City Commute, Trekking, Luxury Preference, Budget-Constrained, Safety-First.
    2. Extract lifestyle tags. 
    3. Suggest features.
    4. Extract maximum budget in Indian Rupees (INR) if mentioned. Detect 'Lakh', 'Cr', 'Crore'. 
       Examples: "15 Lakh" -> 1500000, "1.5 Cr" -> 15000000, "500000" -> 500000. 
       If no budget mentioned, return 0.
    5. Extract minimum seats required based on people count. If not specified, default to 0.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: prompt,
      config: { 
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  category: { type: Type.STRING },
                  lifestyle_patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommended_features: { type: Type.ARRAY, items: { type: Type.STRING } },
                  detected_budget: { type: Type.NUMBER },
                  min_seats: { type: Type.NUMBER }
              }
          }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    return { category: 'City Commute', lifestyle_patterns: ['General Use'], recommended_features: ['Standard Safety'], detected_budget: 0, min_seats: 0 };
  }
};

// --- CONTRACT ANALYSIS FOR BUYER ---
export const extractContractVariables = async (template: string) => {
    const prompt = `
        Analyze this Vehicle Sales Contract Template.
        Identify the SPECIFIC variables/placeholders that the BUYER needs to provide.
        
        TEMPLATE:
        """${template}"""

        Rules:
        1. Look for placeholders like {{buyer_name}}, {{address}}, {{phone}}.
        2. IGNORE placeholders that seem like they should have been filled by the seller (like [VIN], [WARRANTY_DATE]).
        3. CRITICAL: DO NOT ASK for "Driving License", "DL Number", "Passport", or "ID Proof". These are sensitive and collected offline/later. Exclude them from the list.
        4. Output JSON: { "fields": ["Full Name", "Residential Address", ...] }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        fields: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        const res = JSON.parse(response.text || "{}");
        return res.fields || [];
    } catch (e) {
        return ["Full Legal Name", "Current Address"];
    }
}

// --- CONTRACT ANALYSIS FOR SELLER ---
export const identifySellerPlaceholders = async (template: string) => {
    const prompt = `
        Analyze this Contract Template.
        Identify placeholders that the SELLER (Dealership) needs to fill RIGHT NOW before saving the template.
        
        TEMPLATE:
        """${template}"""

        Rules:
        1. Look for placeholders like [VIN], [DATE], [WARRANTY_PERIOD], [DEALER_LICENSE], [STOCK_NO], [PRICE], [MILEAGE], [COLOR].
        2. CRITICAL: DO NOT include placeholders related to the Buyer (e.g., {{buyer_name}}, {{address}}). These must remain blank.
        3. Return distinct labels for the seller to fill.
        
        Output JSON: { "seller_fields": ["VIN Number", "Warranty Duration (Months)", "Today's Date"] }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        seller_fields: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        const res = JSON.parse(response.text || "{}");
        return res.seller_fields || [];
    } catch (e) {
        return [];
    }
}

export const fillSellerVariables = async (template: string, sellerInputs: Record<string, string>) => {
    const prompt = `
        Task: Fill SELLER placeholders in the contract template.
        
        TEMPLATE:
        """${template}"""
        
        SELLER INPUTS:
        ${JSON.stringify(sellerInputs)}
        
        Rules:
        1. Replace placeholders like [VIN], [DATE], etc. with the provided inputs.
        2. CRITICAL: DO NOT touch {{buyer_name}} or any {{placeholder}} meant for the buyer. Leave them exactly as is.
        3. Return the updated template. Maintain any HTML tags if present.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: { type: Type.STRING }
            }
        });
        return cleanHtml(response.text || template);
    } catch (e) {
        return template;
    }
}

export const buildContract = async (template: string, vehicleData: any, userInputs: Record<string, string>) => {
    const prompt = `
      Task: Contract Completion (Final Buyer Fill).
      
      INPUT TEMPLATE (ALREADY FILLED BY SELLER):
      """${template}"""

      USER PROVIDED DETAILS (BUYER):
      ${JSON.stringify(userInputs, null, 2)}
      
      VEHICLE DATA:
      - Model: ${vehicleData.name} ${vehicleData.trim}
      - Price: ${vehicleData.price_range?.[0] || 'TBD'}

      INSTRUCTIONS:
      1. Fill the remaining {{buyer_...}} placeholders using User Details.
      2. Format into clean HTML (A4 style).
      3. CRITICAL: Do NOT use Markdown symbols. Use HTML tags (<h3>, <p>, <b>, <ul>, <br>).
      4. Ensure there is enough vertical spacing between clauses.
      
      Output JSON: { final_contract_html: string, summary: string }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        final_contract_html: { type: Type.STRING },
                        summary: { type: Type.STRING }
                    }
                }
            }
        });
        const res = JSON.parse(response.text || "{}");
        // Ensure final contract HTML is clean
        if (res.final_contract_html) {
            res.final_contract_html = cleanHtml(res.final_contract_html);
        }
        return res;
    } catch (e) {
        return { 
            final_contract_html: "<p>Error generating contract.</p>", 
            summary: "Generation failed." 
        };
    }
};

export const adaptContractToJurisdiction = async (contractHtml: string, region: string) => {
    const prompt = `
      Task: Adapt Vehicle Sales Contract for Jurisdiction: ${region}.
      
      REGULATORY CONTEXT:
      ${REGULATORY_CONTEXT}
      
      INPUT HTML:
      """${contractHtml}"""
      
      INSTRUCTIONS:
      1. Modify clauses to be legally compliant with ${region} specific rules (e.g., if Delhi, add NGT diesel ban clause. If Karnataka, ensure road tax clause reflects 13-18%).
      2. Retain all other vehicle/buyer details.
      3. Return ONLY the complete, updated HTML string.
      4. Maintain clean HTML formatting.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: { type: Type.STRING }
            }
        });
        return cleanHtml(response.text || contractHtml);
    } catch (e) {
        return contractHtml;
    }
}

export const highlightClauses = async (contractText: string, region: string = 'General') => {
    const prompt = `
      Analyze this automotive contract under ${region} jurisdiction laws.
      
      REGULATORY KNOWLEDGE BASE:
      ${REGULATORY_CONTEXT}

      Contract Text: "${contractText.substring(0, 2000)}..."
      
      TASK:
      Identify Obligations, Hidden Fees (check for Handling Charges), and SPECIFIC REGULATORY RISKS based on the Knowledge Base.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        obligations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        fees_penalties: { type: Type.ARRAY, items: { type: Type.STRING } },
                        risk_level: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { obligations: [], fees_penalties: [], risk_level: "Unknown" };
    }
};

export const generateSellerContractTemplate = async (vehicleData: any, region: string = 'General') => {
    // UPDATED PROMPT: Highly detailed, U.S.-style legal document with clear HTML structure.
    
    const prompt = `
    Generate a highly detailed, professional "Vehicle Sales Agreement" in proper HTML format.
    
    CONTEXT DATA:
    - Vehicle: ${vehicleData.name} ${vehicleData.trim} (${vehicleData.drive})
    - Price: [PRICE] (or ${vehicleData.price})
    - Seller: ${vehicleData.dealership_name || 'Seller Name'}
    
    INSTRUCTIONS:
    1.  **Format**: Return ONLY semantic HTML. Use <h3> for section headers. Use <p> for paragraphs with standard line-height. Use <ol> or <ul> for lists. Use <strong> for defined terms or emphasis.
    2.  **Style**: Formal, legal English. Professional and comprehensive.
    3.  **Required Structure & Content**:
        *   **Title**: <h2 style="text-align:center;">VEHICLE SALES AGREEMENT</h2>
        *   **Preamble**: "This Vehicle Sales Agreement (this "Agreement") is made and entered into as of [DATE] (the "Effective Date"), by and between ${vehicleData.dealership_name || 'Seller Name'} ("Seller") and {{buyer_name}} ("Buyer")."
        *   **Recitals**: A "Background" section stating Seller desires to sell and Buyer desires to purchase.
        *   **Article 1: Definitions**. Define "Vehicle", "Purchase Price", "Closing Date", "Parties".
        *   **Article 2: Purchase and Sale**. 
            - Clause 2.1: Agreement to Sell.
            - Clause 2.2: Purchase Price breakdown (Use a <ul> or table structure: Base Price, Sales Tax, Doc Fees, Total).
            - Clause 2.3: Payment Method.
        *   **Article 3: The Vehicle**. Detailed description: Make, Model, Year, VIN [VIN], Mileage [MILEAGE], Color [COLOR].
        *   **Article 4: Representations and Warranties of Seller**.
            - 4.1 Authority.
            - 4.2 Title (Warranty of good title, free of liens).
            - 4.3 **DISCLAIMER OF WARRANTIES ("AS-IS")**. <p><strong>EXCEPT FOR THE WARRANTY OF TITLE, THE VEHICLE IS SOLD "AS IS", AND SELLER EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO, ANY IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.</strong></p>
        *   **Article 5: Representations and Warranties of Buyer**.
            - 5.1 Inspection Acknowledgement. Buyer has inspected the Vehicle.
            - 5.2 Solvency.
        *   **Article 6: Covenants**.
            - 6.1 Maintenance before closing.
            - 6.2 Restrictions on use (mileage limit before delivery).
        *   **Article 7: Conditions to Closing**.
            - 7.1 Payment in full.
            - 7.2 Proof of Insurance by Buyer.
        *   **Article 8: Indemnification and Limitation of Liability**.
            - Standard clause limiting Seller's liability to the Purchase Price.
        *   **Article 9: Miscellaneous**.
            - Governing Law, Entire Agreement, Severability, Amendments (Must be in writing).
        *   **Signatures**.
            - Provide a clear layout for signatures: <div style="margin-top:40px;"><b>SELLER:</b> ____________________ Date: ________</div> <div style="margin-top:20px;"><b>BUYER:</b> ____________________ Date: ________</div>
        *   **Exhibit A**. Placeholder for "Odometer Disclosure Statement".

    4.  **Placeholders**:
        - Seller Fields (to be filled now): [VIN], [DATE], [PRICE], [MILEAGE], [COLOR].
        - Buyer Fields (to be filled later): {{buyer_name}}, {{address}}, {{phone}}.
    
    5.  **Output**: Return only the raw HTML string suitable for embedding in a document viewer.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
        });
        return cleanHtml(response.text || "");
    } catch (e) { return "Error generating template."; }
};

export const refineContractText = async (currentText: string, instruction: string) => {
    const prompt = `Role: Legal Contract Editor. Current Text: """${currentText}""" Instruction: "${instruction}". 
    Constraint: Return ONLY updated text. Maintain HTML tags if present. Do NOT use markdown symbols.`;
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: { type: Type.STRING } // Expect raw string
            }
        });
        return cleanHtml(response.text || currentText);
    } catch (e) { return currentText; }
};

// --- VISUALIZER ---

export const generateVehicleVisuals = async (
    vehicleName: string, 
    vehicleVisualDesc: string, 
    context: string, 
    modification?: string,
    referenceImageBase64?: string
): Promise<string[]> => {
    
    const baseVisual = vehicleVisualDesc || vehicleName;
    const modString = modification ? `MODIFICATION: ${modification}. ` : '';
    
    // Create text prompts
    const prompts = [
        `Photorealistic image of the specific car provided in the reference image, placed in a ${context} environment. ${modString} Maintain the exact car model and color unless modified.`,
        `Side profile view of the referenced car driving in ${context}. ${modString} Cinematic lighting.`,
        `Rear view of the same car parked in ${context}. ${modString} High quality.`,
        `Detail shot of the car in ${context}. ${modString}`
    ];

    try {
        const promises = prompts.map(async (p) => {
            const parts: any[] = [{ text: p }];
            
            // If reference image exists, add it to the parts
            if (referenceImageBase64) {
                // Ensure format is correct (strip prefix if needed, though inlineData usually handles raw)
                const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
                parts.unshift({
                    inlineData: {
                        mimeType: 'image/jpeg', // Assuming jpeg/png
                        data: base64Data
                    }
                });
            }

            const response = await ai.models.generateContent({
                model: MODEL_IMAGES,
                contents: { parts: parts },
            });
            
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
            return null;
        });

        const results = await Promise.all(promises);
        return results.filter(Boolean) as string[];

    } catch (e) {
        console.error("Visualizer Error:", e);
        return [];
    }
};

// --- INSURANCE AI ---

export const analyzeInsuranceNeeds = async (intentResult: IntentResult, availablePlans: InsurancePlan[]) => {
    const prompt = `
        Task: Recommend the best insurance plan for a user based on their lifestyle and the available plans.
        
        User Profile:
        - Category: ${intentResult.category}
        - Lifestyle Tags: ${intentResult.lifestyle_patterns?.join(', ') || 'General'}
        - Budget Limit: ${intentResult.detected_budget || 'Unknown'}
        
        Available Plans:
        ${JSON.stringify(availablePlans)}
        
        Instructions:
        1. Select ONE plan as the "Best Fit".
        2. Explain WHY in 1 sentence (e.g. "Because you do off-roading, the Engine Protect add-on is crucial.").
        
        Output JSON: { "recommendedPlanId": string, "reason": string }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        recommendedPlanId: { type: Type.STRING },
                        reason: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { recommendedPlanId: availablePlans[0]?.id, reason: "Best general coverage." };
    }
}

export const queryInsuranceAgent = async (question: string, plans: InsurancePlan[]) => {
    const prompt = `
      System: You are an Expert Insurance Agent.
      Context: The user is looking at these specific plans for their car:
      ${JSON.stringify(plans)}
      
      User Question: "${question}"
      
      Instructions:
      1. Answer the question specifically referencing the plans provided if applicable.
      2. If the user asks for comparison, compare premiums and coverage.
      3. Explain terms like "Zero Dep", "IDV", "RTI" simply if asked.
      4. Be concise.
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: prompt
        });
        return response.text || "I can't answer that right now.";
    } catch (e) {
        return "Service unavailable.";
    }
}
