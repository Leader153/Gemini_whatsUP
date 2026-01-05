# Issue Report: Migration from Google AI Studio to Vertex AI

## Summary
We are currently running a Voice AI application using the Gemini API. The project has been successfully implemented using the Google AI Studio SDK (`@google/generative-ai`) with a standard API Key (`GEMINI_API_KEY="AIza..."`).

However, as we are hitting the **quota limits** of the AI Studio free tier, we attempted to migrate to **Google Cloud Vertex AI** (paid tier) to unlock higher usage limits. This migration has resulted in persistent, unresolvable errors that have forced us to roll back.

## Current Working Setup (Google AI Studio)
- **Library**: `@google/generative-ai`
- **Authentication**: `GEMINI_API_KEY` (AIza...)
- **Status**: Fully functional with excellent latency and performance.
- **Limitation**: Approaching daily/minute quota limits, requiring a production upgrade.

## The Issue with Vertex AI
We attempted to switch to the Vertex AI SDK (`@google-cloud/vertexai` or via the adapted standard SDK) to consume paid resources via Google Cloud Project.

**Symptoms & Errors:**
1. Despite configuring `Application Default Credentials` (ADC) and enabling the Vertex AI API in the Google Cloud Console, the integration fails consistently.
2. We encountered persistent errors related to authentication and session management that were not present in the AI Studio version.
3. The errors appear seemingly random or unfixable despite following standard migration documentation (e.g., "Permission Denied", "Resource exhausted" prematurely, or unknown internal library errors).
4. As a result, we are unable to use the paid/enterprise tier effectively and are stuck on the limited AI Studio tier.

## Request
We need assistance in successfully migrating our working Node.js application from the AI Studio API Key method to valid Vertex AI authentication without breaking the core functionality/latency of the voice bot.
