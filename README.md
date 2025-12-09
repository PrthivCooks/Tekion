Tekion SmartPurchase Engine

AI-Driven Automotive Purchase, Contracting, and Insurance Recommendation Platform
Team: Innoventures

Overview

Tekion SmartPurchase Engine is an end-to-end intelligent automotive retail system that streamlines the process of vehicle selection, financing, contracting, and insurance.

The platform uses Google AI Studio (Gemini), Firebase, and Imagen to create a guided buying experience. It includes a user portal, seller portal, dynamic contract generation, clause highlighting, insurance recommendations, and a complete analytics dashboard for dealerships.

Features
User Portal

Intent analysis from free-form text

Vehicle match intelligence

Lifestyle-based image generation

Dynamic contract builder with auto-filled fields

Clause highlighting and legal summarization

Contract clarification chatbot

Insurance Garage:

Recommended insurance plans

Add-ons and coverage explanations

Insurance chatbot

Option to send queries to sellers

E-sign ready contract review

Seller Portal

Add, edit, and manage vehicle listings

Add and edit insurance plans

Manage contract templates

Review user-submitted contracts

View user queries (general and insurance-specific)

Analytics dashboard including:

Lifestyle segment trends (family, trekking, city commute)

Budget trends

F&I bundle popularity

Insurance query and usage statistics

Vehicle match distribution

AI Agents (Google AI Studio)

The system uses multiple agent prompts including:

Intent Extraction Agent

Vehicle Match Engine

Imagen-Based Vehicle Visualization Agent

Contract Builder Agent

Clause Highlighting Agent

Legal Summary Agent

Contract QA Chatbot

Insurance Recommendation Engine

Insurance Chatbot

Seller Data Normalization Agents (vehicles, insurance)

Technology Stack
Frontend

Next.js / React

Tailwind CSS

ShadCN UI

Charts via Recharts

Backend

Firebase Functions or Express

Firestore (NoSQL database)

Google AI Studio (Gemini API)

Google Imagen model

Authentication

Firebase Authentication

Role-based access using custom claims (user, seller)

Firestore Structure
/users/{userId}
    name, email, role, created_at

/sellers/{sellerId}
    dealership_name, role

/vehicles/{vehicleId}
    name, type, trim, price_range[], use_cases[], f_and_i[]

/contracts/{contractId}
    userId, sellerId, vehicleId
    contract_html, highlights, summary, status

/insurance_plans/{insuranceId}
    provider, plan_name, coverage_details[], exclusions[],
    add_ons[], price_range

/user_policies/{policyId}
    userId, insuranceId, vehicleId, premium_amount

/queries/{queryId}
    from_userId, to_sellerId, message, reply, status

/insurance_queries/{queryId}
    from_userId, insuranceId, message, reply, status

/analytics/usage
    family_count
    trekking_count
    city_commute_count
    budget_distribution
    fi_bundle_popularity
    insurance_usage

System Architecture

User enters lifestyle intent

Intent Engine extracts user profile

Vehicle Match Engine suggests optimal vehicles

Imagen generates lifestyle-based vehicle visuals

Contract Builder constructs pre-filled contract

Clause Highlight Engine extracts key terms

Insurance Engine recommends plans

AI chatbots answer contract or insurance questions

User sends queries to seller

Seller reviews queries, contracts, and dashboard insights
