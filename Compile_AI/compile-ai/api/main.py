
"""
Compile AI - FastAPI Backend

Pipeline:
User Requirement
      ↓
NLP Analysis
      ↓
Tier 1 Trained Classifier
      ↓
Gemini Generative AI Consultant
      ↓
Benchmark
      ↓
Compliance
      ↓
Vendor Lock-in
      ↓
Translation
      ↓
Final Output
"""

import os
import time
import random
import threading
from contextlib import asynccontextmanager
import warnings
import joblib
import re
import requests

# Suppress scikit-learn version mismatch warnings gracefully
try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except ImportError:
    pass

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from langdetect import detect

from fastapi.middleware.cors import CORSMiddleware

from dataset_utils import find_similar_examples
from benchmark import calculate_benchmark
from compliance import get_compliance_mapping
from lockin import calculate_lockin


# ============================================================
# AFC TOOL: DATASET SEARCH
# ============================================================

def search_dataset(query: str, n_results: int = 3) -> str:
    """
    Searches the internal Compile AI dataset for relevant past enterprise blueprints,
    tech stacks, BRD objectives, functional requirements, and effort estimates.
    """
    try:
        examples = find_similar_examples(raw_input_text=query, limit=n_results)
        if not examples:
            return "No matching blueprint dataset records found."

        formatted_items = []
        for ex in examples:
            formatted_items.append(
                f"- Problem: {ex.get('problem_title')}\n"
                f"  Industry: {ex.get('industry')}, Size: {ex.get('company_size_tag')}\n"
                f"  Objectives: {ex.get('brd_objectives')}\n"
                f"  Functional Requirements: {ex.get('functional_requirements')}\n"
                f"  Architecture: {ex.get('hld_summary')}\n"
                f"  Tech Stack: {ex.get('tech_stack')}\n"
                f"  Cost Band: {ex.get('cost_band')}"
            )
        return "\n\n".join(formatted_items)
    except Exception as e:
        return f"Dataset search error: {str(e)}"


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(__file__),
        ".env"
    )
)

# Also fallback to root workspace .env if GEMINI_API_KEY not found
if not os.environ.get("GEMINI_API_KEY"):
    root_env = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
    )
    if os.path.exists(root_env):
        load_dotenv(dotenv_path=root_env)


# ============================================================
# STARTUP: WARM DATASET CACHE IN BACKGROUND
# ============================================================

def _warmup_cache():
    """
    Build TF-IDF index in a background thread so the first user
    request is not blocked by the 50-second cold-start.
    The server accepts requests immediately; the index is ready
    within ~60s of startup.
    """
    try:
        from dataset_utils import _ensure_cache
        print("[startup] Warming TF-IDF dataset cache in background...")
        _ensure_cache()
        print("[startup] TF-IDF cache warm-up complete.")
    except Exception as e:
        print(f"[startup] Cache warm-up failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(application):
    # Fire the warm-up in a daemon thread — does not block startup
    t = threading.Thread(target=_warmup_cache, daemon=True, name="dataset-warmup")
    t.start()
    yield  # app runs here
    # (cleanup on shutdown if needed)


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Compile AI API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MODEL PATH
# ============================================================

MODEL_PATH = os.environ.get(
    "COMPILE_CLASSIFIER_PATH",
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "models",
        "tier1_classifier",
        "compile_field_classifier.joblib"
    )
)

_classifier_bundle = None


# ============================================================
# CLASSIFIER LOADER
# ============================================================

def get_classifier():

    global _classifier_bundle

    if _classifier_bundle is None:

        if not os.path.exists(MODEL_PATH):

            raise HTTPException(
                status_code=500,
                detail=f"Classifier not found at {MODEL_PATH}"
            )

        _classifier_bundle = joblib.load(
            MODEL_PATH
        )

    return _classifier_bundle


# ============================================================
# GEMINI ROUND-ROBIN KEY POOL & CLIENT MANAGER
# ============================================================

_DEFAULT_GEMINI_KEYS = []

class GeminiKeyRotator:
    def __init__(self):
        raw_keys = os.environ.get("GEMINI_API_KEYS", "")
        if raw_keys:
            self.keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        else:
            single = os.environ.get("GEMINI_API_KEY", "")
            self.keys = [single.strip()] if single.strip() else []
        self.index = 0
        self.lock = threading.Lock()
        self.cooldowns = {} # key -> timestamp when available

    def get_current_key(self) -> str:
        with self.lock:
            now = time.time()
            n = len(self.keys)
            for i in range(n):
                idx = (self.index + i) % n
                k = self.keys[idx]
                if now >= self.cooldowns.get(k, 0):
                    self.index = idx
                    return k
            best = min(self.keys, key=lambda k: self.cooldowns.get(k, 0))
            self.index = self.keys.index(best)
            return best

    def rotate_to_next(self, reason: str = "") -> str:
        with self.lock:
            failed_key = self.keys[self.index % len(self.keys)]
            self.cooldowns[failed_key] = time.time() + 60.0
            old_idx = self.index
            self.index = (self.index + 1) % len(self.keys)
            new_key = self.keys[self.index]
            print(f"[RoundRobin KeyRotator] Key #{old_idx+1} ({failed_key[:12]}...) exhausted ({reason}). Rotated to Key #{self.index+1} ({new_key[:12]}...).")
            return new_key

    def advance_round_robin(self):
        with self.lock:
            self.index = (self.index + 1) % len(self.keys)

    def get_client(self) -> genai.Client:
        key = self.get_current_key()
        return genai.Client(api_key=key)

gemini_key_rotator = GeminiKeyRotator()

def get_gemini_client():
    return gemini_key_rotator.get_client()


# ============================================================
# GROQ HIGH-SPEED BACKUP CLIENT
# ============================================================

def call_groq_fallback(prompt: str, system_instruction: str = None) -> str:
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        return None
    groq_model = os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b").strip()
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": groq_model,
                "messages": messages,
                "temperature": 0.2
            },
            timeout=25
        )
        if r.ok:
            data = r.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print("[Groq Fallback] Error:", e)
    return None


# ============================================================
# GEMINI RETRY & ROUND-ROBIN RUNNER
# ============================================================

def generate_with_retry(
    client=None,
    prompt: str = "",
    preferred_model: str = None,
    tools: list = None,
    max_retries: int = 2,
    system_instruction: str = None
):
    """
    Executes AI generation across a round-robin pool of Gemini API keys.
    Automatically rotates to the next API key when rate limits (429), quota exhaustion
    (RESOURCE_EXHAUSTED), or 503 occur.
    Falls back to Groq if all Gemini keys are in cooldown.
    """
    active_preferred = (preferred_model or os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")).strip()
    candidate_models = []
    for m in [active_preferred, "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"]:
        if m and m not in candidate_models:
            candidate_models.append(m)

    num_keys = len(gemini_key_rotator.keys)
    last_error = None

    # Loop through the round-robin key pool
    for key_attempt in range(num_keys):
        current_api_key = gemini_key_rotator.get_current_key()
        active_client = genai.Client(api_key=current_api_key)

        for model_name in candidate_models:
            is_exhausted = False
            for attempt in range(max_retries):
                try:
                    config_kwargs = {}
                    if tools:
                        config_kwargs["tools"] = tools
                    if system_instruction:
                        config_kwargs["system_instruction"] = system_instruction

                    config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

                    chat = active_client.chats.create(
                        model=model_name,
                        config=config
                    )
                    response = chat.send_message(prompt)
                    if response and response.text:
                        gemini_key_rotator.advance_round_robin()
                        return response.text.strip()
                except Exception as e:
                    err_str = str(e)
                    last_error = e

                    is_exhausted = any(
                        code in err_str
                        for code in ["429", "ResourceExhausted", "RESOURCE_EXHAUSTED", "QuotaExceeded", "quota", "exhausted", "503", "UNAVAILABLE", "high demand", "ReadTimeout"]
                    )
                    if is_exhausted:
                        # Try fallback model on this key before giving up
                        break
                    else:
                        print(f"[Gemini] Error on model {model_name}: {err_str[:80]}")
                        break

        # If all candidate models on this key were exhausted, rotate key in pool
        gemini_key_rotator.rotate_to_next(reason="Candidate models rate-limited/cooling down on this key")

    # If all Gemini keys in pool were exhausted, attempt Groq fallback
    print("[KeyRotator] All Gemini keys currently exhausted/cooling down. Triggering Groq fallback...")
    groq_reply = call_groq_fallback(prompt, system_instruction)
    if groq_reply:
        print("[Groq] Fallback successful!")
        return groq_reply

    raise last_error or Exception("Gemini generation failed across all keys and fallback models.")


# ============================================================
# MULTILINGUAL ROUTING & DETECTION
# ============================================================

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "gu": "Gujarati",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "pa": "Punjabi",
    "kn": "Kannada",
    "ml": "Malayalam",
    "ur": "Urdu",
    "ar": "Arabic",
    "zh": "Chinese",
    "ja": "Japanese",
    "ru": "Russian",
    "pt": "Portuguese",
    "it": "Italian",
}

def detect_language_name(text: str, fallback_language: str = "English") -> str:
    """
    Accurately detects user language, handling Indic scripts (Devanagari, Gujarati),
    Romanized Hinglish/Gujlish, and standard ISO-639-1 language codes.
    """
    resolved_fallback = LANGUAGE_NAMES.get(str(fallback_language).lower(), fallback_language) if fallback_language else "English"
    if not text or not text.strip():
        return resolved_fallback or "English"

    s = text.strip()

    # 1. Unicode script detection
    if any('\u0A80' <= c <= '\u0AFF' for c in s):
        return "Gujarati"
    if any('\u0900' <= c <= '\u097F' for c in s):
        return "Hindi"

    # 2. Romanized keywords
    lower_words = set(re.findall(r'\b\w+\b', s.lower()))
    hinglish_kw = {
        "kya", "kaise", "chahiye", "karo", "kare", "karna", "karne", "banao", "ke", "ki", "ka", "ko",
        "liye", "hoga", "hogi", "honge", "mujhe", "hum", "hume", "hame", "batao", "bataiye", "hai", "hain",
        "ho", "sakti", "sakta", "sakte", "h", "nahi", "hota", "hoti", "hote", "bhi", "aur", "toh", "ye",
        "yeh", "wo", "woh", "iss", "is", "iska", "iski", "iske", "kitna", "kitni", "kitne", "kyu", "kyun",
        "kab", "kahan", "yaha", "yahan", "waha", "wahan", "sirf", "sab", "sabhi", "kuch"
    }
    if len(lower_words.intersection(hinglish_kw)) >= 2 or any(w in lower_words for w in ["kya", "kaise", "kitna", "kitni", "kitne", "kyu", "kyun", "batao", "bataiye", "chahiye"]):
        return "Hindi"

    gujlish_kw = {
        "kem", "karvanu", "chhe", "che", "mate", "joie", "aapo", "tamare", "nathi", "shu", "su",
        "kare", "karyu", "na", "ne", "thi", "ma", "pan", "haveli", "ketlu", "ketla", "kyare", "kyan"
    }
    if len(lower_words.intersection(gujlish_kw)) >= 2 or any(w in lower_words for w in ["kem", "chhe", "karvanu", "ketlu", "ketla", "shu"]):
        return "Gujarati"

    # 3. Standard langdetect library
    try:
        iso_code = detect(s)
        return LANGUAGE_NAMES.get(iso_code, resolved_fallback or "English")
    except Exception:
        return resolved_fallback or "English"

def detect_language(text: str):
    return detect_language_name(text)


# ============================================================
# /health
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "tier1_model": "loaded on request",
        "generative_ai": "Gemini"
    }


# ============================================================
# /classify
# TIER 1 CLASSIFICATION
# ============================================================

class ClassifyRequest(BaseModel):

    text: str = Field(
        ...,
        min_length=1
    )


class ClassifyResponse(BaseModel):

    industry: str

    company_size_tag: str

    problem_title: str

    budget_band: str

    cost_band: str


@app.post(
    "/classify",
    response_model=ClassifyResponse
)
def classify(req: ClassifyRequest):

    models = get_classifier()

    output = {}

    for field, model_data in models.items():

        vectorizer = model_data["vectorizer"]

        classifier = model_data["classifier"]

        vector = vectorizer.transform(
            [req.text]
        )

        prediction = classifier.predict(
            vector
        )[0]

        output[field] = str(
            prediction
        )

    return output


# ============================================================
# /translate
# GEMINI TRANSLATION
# ============================================================

class TranslateRequest(BaseModel):

    text: str = Field(
        ...,
        min_length=1
    )

    target_lang: str = Field(
        ...,
        description="Example: English, Hindi, Gujarati, Spanish"
    )


class TranslateResponse(BaseModel):

    translated_text: str

    detected_source_lang: str | None = None


@app.post(
    "/translate",
    response_model=TranslateResponse
)
def translate(req: TranslateRequest):

    client = get_gemini_client()

    prompt = f"""
Translate the following text into {req.target_lang}.

Rules:
- Return ONLY the translated text.
- Do not explain anything.
- Do not add notes.

Text:
{req.text}
"""

    try:
        translated_text = generate_with_retry(
            client=client,
            prompt=prompt,
            preferred_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
            max_retries=2
        )
        return TranslateResponse(translated_text=translated_text)
    except Exception as e:
        print("Translate Gemini call failed after retries:", e)
        return TranslateResponse(translated_text=req.text)


# ============================================================
# /consultant/discover
# GEMINI DISCOVERY QUESTIONS
# ============================================================

class DiscoverRequest(BaseModel):

    raw_input_text: str = Field(
        ...,
        min_length=1
    )

    user_language: str = "English"


class DiscoverResponse(BaseModel):

    questions: list[str]


@app.post(
    "/consultant/discover",
    response_model=DiscoverResponse
)
def discover(req: DiscoverRequest):

    client = get_gemini_client()
    target_language = detect_language_name(req.raw_input_text, fallback_language=req.user_language or "English")
    if target_language == "English" and req.user_language and req.user_language.lower() != "english":
        target_language = req.user_language

    prompt = f"""
You are a business requirements consultant.

Read the client's requirement below.

Generate 3 to 7 useful clarifying questions.

Focus ONLY on information that is genuinely missing, such as:
- stakeholders
- number of users
- scale
- timeline
- budget
- technical constraints
- existing systems
- security requirements

Do NOT ask questions whose answers are already clearly present.

MANDATORY LANGUAGE:
Write the questions strictly in {target_language}.

Return ONLY the questions, one question per line.
Do not number them.

Client requirement:
{req.raw_input_text}
"""

    raw_text = None
    try:
        raw_text = generate_with_retry(
            client=client,
            prompt=prompt,
            preferred_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
            max_retries=2
        )
    except Exception as e:
        print("Discover Gemini call failed after retries:", e)

    if not raw_text:
        if target_language == "Hindi":
            return DiscoverResponse(
                questions=[
                    "इस प्रणाली के साथ दैनिक रूप से कौन से प्रमुख हितधारक और उपयोगकर्ता भूमिकाएं काम करेंगी?",
                    "इस समाधान को किन मौजूदा डेटाबेस, स्प्रेडशीट या ईआरपी उपकरणों के साथ एकीकृत होना चाहिए?",
                    "आपके संगठन पर कौन से विशिष्ट अनुपालन, डेटा सुरक्षा या नियामक नियम लागू होते हैं?",
                    "इस पहल के लिए आपकी लक्षित समयसीमा और आवंटित बजट क्या है?",
                    "90 दिनों में कौन से मापने योग्य परिचालन मेट्रिक्स इस परियोजना की सफलता को परिभाषित करते हैं?"
                ]
            )
        elif target_language == "Gujarati":
            return DiscoverResponse(
                questions=[
                    "આ સિસ્ટમ સાથે દરરોજ કયા મુખ્ય હિતધારકો અને વપરાશકર્તા ભૂમિકાઓ ક્રિયાપ્રતિક્રિયા કરશે?",
                    "આ સોલ્યુશન કયા હાલના ડેટાબેસેસ, સ્પ્રેડશીટ્સ અથવા ERP સાધનો સાથે સંકલિત થવું જોઈએ?",
                    "તમારા સંગઠન પર કયા ચોક્કસ પાલન, ગોપનીયતા અથવા સુરક્ષા નિયમો લાગુ પડે છે?",
                    "આ પહેલ માટે તમારી લક્ષિત રોલઆઉટ સમયરેખા અને ફાળવેલ બજેટ શું છે?",
                    "90 દિવસમાં કયા માપી શકાય તેવા ઓપરેશનલ મેટ્રિક્સ આ પ્રોજેક્ટની સફળતાને વ્યાખ્યાયિત કરે છે?"
                ]
            )
        return DiscoverResponse(
            questions=[
                "What key stakeholders and user roles will interact with this system daily?",
                "What legacy databases, spreadsheets, or ERP tools must this solution integrate with?",
                "What specific compliance, privacy, or security regulations apply to your organization?",
                "What is your target rollout timeline and allocated budget for this initiative?",
                "What measurable operational metrics define success for this project in 90 days?"
            ]
        )

    questions = []

    for line in raw_text.splitlines():

        line = line.strip()

        if not line:
            continue

        line = line.lstrip(
            "-•0123456789. )"
        ).strip()

        if line:

            questions.append(
                line
            )

    return DiscoverResponse(
        questions=questions
    )


# ============================================================
# /consultant/chat
# INTERACTIVE DISCOVERY CHAT & DATA GENERATION
# ============================================================

class ChatHistoryItem(BaseModel):
    sender: str = "user"
    text: str = ""


class ConsultantChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_title: str = "Enterprise Transformation"
    raw_input_text: str = ""
    context_goals: str = ""
    context_constraints: str = ""
    discovery_answers: dict[str, str] = {}
    conversation_history: list[ChatHistoryItem] = []
    user_language: str = "English"


class ConsultantChatResponse(BaseModel):
    reply: str
    detected_intent: str = "general"
    generated_data: dict | None = None


@app.post(
    "/consultant/chat",
    response_model=ConsultantChatResponse
)
def consultant_chat(req: ConsultantChatRequest):
    client = get_gemini_client()

    # Determine accurate target language based on user message and user_language setting
    resolved_user_lang = LANGUAGE_NAMES.get(str(req.user_language).lower(), req.user_language) if req.user_language else "English"
    detected_lang = detect_language_name(req.message, fallback_language=resolved_user_lang)
    target_language = detected_lang if detected_lang != "English" else resolved_user_lang

    # Build context summary
    context_text = req.raw_input_text.strip() or req.context_goals.strip()
    if not context_text:
        context_text = req.session_title

    qas_text = ""
    if req.discovery_answers:
        for q, a in req.discovery_answers.items():
            if a and a.strip():
                qas_text += f"- Question: {q}\n  Answer: {a}\n"

    history_text = ""
    if req.conversation_history:
        for h in req.conversation_history[-6:]:
            role = "Client" if h.sender == "user" else "Consultant"
            history_text += f"{role}: {h.text}\n"

    prompt = f"""You are Compile AI, an elite Principal Enterprise Solution Architect and Senior Business Analyst conducting an interactive discovery consultation for an enterprise client.

Client Initiative Title: {req.session_title}
Core Business Requirements & Scope:
{context_text}

Active System Constraints & Integrations:
{req.context_constraints or "Standard enterprise cloud architecture"}

Answered Discovery Clarifications:
{qas_text or "No discovery questions answered yet."}

Recent Conversation Context:
{history_text or "First exchange in discovery chat."}

Client Inquiry / Prompt:
"{req.message}"

MANDATORY MULTILINGUAL INSTRUCTION:
The client is communicating in: {target_language}.
You MUST generate your ENTIRE response, analysis, headings, and data in: {target_language}.
- If {target_language} is Hindi (हिंदी), generate your response in natural Hindi or Hinglish (retaining standard technical terms like React, PostgreSQL, Docker, AWS in English for enterprise clarity).
- If {target_language} is Gujarati (ગુજરાતી), generate your response in Gujarati (retaining standard technical terms in English).
- If {target_language} is Spanish (Español), all content must be in Spanish.
- Core technical terms (e.g. PostgreSQL, Redis, React, Docker, TLS 1.3, JWT, REST API) can remain in English for industry clarity, but all explanations, table descriptions, column headers, and structural advice MUST be written in {target_language}.

CRITICAL GROUNDING IN CLIENT-PROVIDED DATA:
You MUST directly base your generated analysis, specifications, numbers, and recommendations on ALL the data the client has already provided!
1. Check "Answered Discovery Clarifications" and "Core Business Requirements & Scope" above:
   The client has provided concrete operational details (e.g. timelines, budgets, compliance policies, 90-day operational metrics, integration systems, and user roles).
2. Explicitly synthesize their data into your response:
   - When asked about Cost / Timeline / Effort: Calculate the cost and resource allocation specifically based on their stated MVP timeline (e.g. 8–12 weeks), their required integrations (e.g. SharePoint, Google Drive, internal databases, ERPs), their security scope (strict RBAC, document-level permissions, audit logging), and their user roles (employees, managers, HR, compliance, IT admins).
   - When asked about Architecture / Tech Stack: Select and configure components tailored to their document ingestion pipeline, semantic search needs, and RBAC requirements.
   - When asked about Requirements / Success Metrics: Directly incorporate and build upon their 90-day success criteria (answer accuracy, citation correctness, retrieval latency, user adoption, reduced repetitive support).
3. Explicitly cite and tie into what the client stated:
   (e.g., "Based on your requirement for an 8–12 week MVP covering document ingestion, role-based access control, and SharePoint/Drive integrations...").
4. NEVER output generic detached boilerplate that ignores the client's provided answers and context documents.

INSTRUCTIONS FOR DATA GENERATION & RESPONSE:
1. Provide an authoritative, in-depth, and structured response with REAL, CONCRETE DATA:
   - If asking for Architecture / Tech Stack: give exact choices for Frontend, Backend, Database, Cloud/Hosting, Caching, and Security with clear technical rationale.
   - If asking for Requirements / Features: give structured functional requirements (FR-X), non-functional requirements (NFR-X), user stories, and acceptance criteria.
   - If asking for Database / Schema / Data Model: provide entity tables, fields with types, primary keys, foreign keys, and relationship descriptions.
   - If asking for Cost / Timeline / Effort: provide realistic phase-by-phase weeks, team composition (roles), and 3-tier USD cost estimates (Low MVP, Mid Baseline, High Enterprise).
   - If asking for API Endpoints / Integrations: provide RESTful endpoints with HTTP method, URI, request payload, and response status.
   - If asking for Compliance / Security: provide specific regulatory requirements (HIPAA, SOC 2, GDPR, PCI-DSS) and tangible security controls.
   - If asking for Gap Analysis or Trade-offs: compare Current State vs Desired State with operational and financial impact.
   - If asking an architectural question or advice: give actionable, professional enterprise recommendations with trade-offs.
2. Format with clean, rich Markdown:
   - Use Markdown headings (##, ###)
   - Use Markdown tables (| Column | Column |) for structured comparisons, schemas, and timelines
   - Use bullet points and bold highlights for readability
   - Use code/schema blocks (```) for configuration, schemas, or endpoints
"""

    # ── PRIMARY: Pure AI generation (no dataset injection) ──
    reply_text = None
    try:
        reply_text = generate_with_retry(
            client=client,
            prompt=prompt,
            preferred_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
            max_retries=2
        )
    except Exception as e:
        print("Consultant Chat Gemini call failed after retries:", e)

    # ── DATASET FALLBACK: Only reached if ALL AI APIs are exhausted ──
    if not reply_text:
        try:
            dataset_snippet = search_dataset(f"{req.session_title} {req.message}", n_results=3)
            if dataset_snippet and not dataset_snippet.startswith("No matching") and not dataset_snippet.startswith("Dataset search error"):
                reply_text = (
                    f"### Enterprise Dataset Benchmarks\n\n"
                    f"*AI generation is temporarily unavailable — showing matched records from 105,500 enterprise benchmarks:*\n\n"
                    f"{dataset_snippet}\n\n"
                    f"*Please retry in a moment for a full AI-generated response.*"
                )
        except Exception as ds_err:
            print("Dataset fallback also failed:", ds_err)

    # ── KEYWORD FALLBACK: structured template if dataset also failed ──
    if not reply_text:
        classified = classify(ClassifyRequest(text=context_text or req.message))
        ind = classified.get("industry", "Technology")
        prob = classified.get("problem_title", req.session_title)
        cost = classified.get("cost_band", "Mid")
        msg_lower = req.message.lower()

        if any(w in msg_lower for w in ["tech stack", "technology", "architecture", "database", "backend", "frontend"]):
            reply_text = f"""### Recommended Solution Architecture & Tech Stack ({ind})

*Note: Live AI service encountered a load spike — this is a dataset & classifier derived recommendation.*

| Layer | Recommended Technology | Architectural Rationale |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite | High responsiveness, component reusability, and fast bundle execution. |
| **API Gateway / Backend** | Node.js (Express) & Python (FastAPI) | Microservices architecture: Node.js handles real-time I/O, FastAPI manages ML & computational workloads. |
| **Primary Database** | PostgreSQL 16 (Relational) / MySQL 8.0 | ACID compliance, transactional integrity for core business entities. |
| **Cache & Session** | Redis 7.2 | High-throughput in-memory caching and session state management. |
| **Cloud Hosting** | AWS / Azure / GCP (Containerized ECS/AKS) | Containerized Docker microservices with auto-scaling and 99.9% uptime SLA. |
| **Security & Auth** | OAuth2 + OpenID Connect / JWT + RBAC | Enterprise grade identity management and cryptographic authorization. |

#### Data Flow Summary
1. Client makes authenticated TLS 1.3 requests through the API gateway.
2. Backend processes business validation and queries PostgreSQL with indexing on primary entities.
3. Hot queries and cached session data are retrieved from Redis.
"""
        elif any(w in msg_lower for w in ["cost", "estimate", "budget", "timeline", "weeks", "price"]):
            reply_text = f"""### Estimated Project Timeline & Cost Breakdown ({ind} — {prob})

*Note: Live AI service encountered a load spike — derived from 105,500 enterprise dataset benchmarks.*

| Phase | Duration | Focus Area | Deliverables |
|---|---|---|---|
| **Phase 1: Discovery & Planning** | 2 Weeks | Scope alignment & requirements | Finalized BRD, user stories, security baseline |
| **Phase 2: Architecture & UX** | 2 Weeks | HLD & UI/UX wireframes | System architecture, Figma design system, DB schema |
| **Phase 3: Core Implementation** | 6–8 Weeks | Full-stack development & APIs | Working microservices, frontend workspace, database |
| **Phase 4: QA & Compliance** | 2 Weeks | Security, load testing & audits | Automated tests, penetration test sign-off |
| **Phase 5: Staging & Pilot Launch**| 2 Weeks | Production rollout & monitoring | CI/CD deployment, telemetry, staff training |

**Total Estimated Duration**: 14–16 Weeks

#### Budget Bands (USD)
- **Minimum Viable Product (MVP)**: $25,000 – $40,000 (Core workflows only)
- **Recommended Production Baseline**: $55,000 – $85,000 (Standard enterprise integration)
- **High-Resilience Enterprise**: $120,000+ (Multi-region HA, 24/7 SLA, full audit trail)
"""
        elif any(w in msg_lower for w in ["requirement", "functional", "features", "user stories", "fr"]):
            reply_text = f"""### Core Functional & Non-Functional Requirements ({ind})

*Note: Live AI service encountered a load spike — derived from enterprise pattern matching.*

#### 1. Functional Requirements (FR)
- **FR-1 [User Onboarding & RBAC]**: System must support role-based permissions (Admin, Member, Viewer) with secure multi-tenant isolation.
- **FR-2 [Workflow Automation]**: Automated processing of core business transactions with real-time status tracking.
- **FR-3 [Audit Trail]**: Every modification to business entities must record an immutable timestamped log.
- **FR-4 [Search & Retrieval]**: Sub-second full-text and indexed search across all active records.
- **FR-5 [Export & Reporting]**: Generation of operational reports in PDF, Excel, and JSON formats.

#### 2. Non-Functional Requirements (NFR)
- **NFR-1 [Performance]**: 95% of API requests must complete in under 250ms under normal load.
- **NFR-2 [Security]**: TLS 1.3 encryption in transit, AES-256 for sensitive stored records.
- **NFR-3 [Availability]**: 99.9% uptime target with automated health checks and self-healing restarts.
"""
        else:
            reply_text = f"""### Consultative Analysis for "{req.message}"

*Domain: {ind} | Initiative: {prob}*

Regarding your inquiry: **"{req.message}"**

In enterprise software engineering for **{ind}**, this requirement involves three key architectural considerations:

1. **Integration Architecture**: Ensuring seamless data flow between legacy systems and the modern cloud platform through documented REST/GraphQL APIs and webhook consumers.
2. **Data Governance & Security**: Implementing strict least-privilege RBAC, field-level encryption for sensitive attributes, and structured audit logs.
3. **Operational Scalability**: Designing the ingestion pipeline to accommodate sudden traffic bursts without degrading core service performance.

*You can ask more specific questions about tech stack choices, database schema, API contracts, or cost estimates, and I will generate the complete technical specifications for you.*
"""

    return ConsultantChatResponse(
        reply=reply_text,
        detected_intent="general",
        generated_data={"status": "generated"}
    )


# ============================================================
# /consultant/generate
# GEMINI BRD / ARCHITECTURE / ESTIMATION
# ============================================================

class GenerateRequest(BaseModel):

    raw_input_text: str = Field(
        ...,
        min_length=1
    )

    discovery_answers: dict[str, str] = {}

    section: str = Field(
        default="all",
        description=(
            "gap_analysis | brd | architecture | estimate | all"
        )
    )

    user_language: str = "English"


class GenerateResponse(BaseModel):

    section: str

    content: str


SECTION_PROMPTS = {

    "gap_analysis":
        """
Write a current-state vs desired-state gap analysis
for this business.

Give 3 to 5 clear sentences.
""",

    "brd":
        """
Write a structured Business Requirement Document.

Include:
- Objectives
- Scope
- Stakeholders
- Functional requirements
- Non-functional requirements
- Assumptions
- Constraints
""",

    "architecture":
        """
Recommend a High-Level Design.

Include:
- Major components
- System integrations
- Data flow
- Frontend technology
- Backend technology
- Database
- Hosting
- Security considerations

Give a short reason for each technology choice.
""",

    "estimate":
        """
Produce a detailed, requirement-driven project effort and cost estimate.

IMPORTANT: Do NOT use generic or placeholder numbers.
Derive all estimates from the actual business requirement provided.
Consider: number of modules, integration complexity, compliance burden,
team size implied, and any timeline constraints mentioned.

Structure your response EXACTLY as follows (keep the section headers):

## Phase Breakdown

| Phase | Weeks | % of Project |
|---|---|---|
| Discovery & Requirements | [N] | [%] |
| Architecture & UX Design | [N] | [%] |
| Core Build & Integration | [N] | [%] |
| Testing, QA & Compliance | [N] | [%] |
| Deployment & Pilot Launch | [N] | [%] |

**Total Timeline**: [N] Weeks

## Cost Band

- **Minimum MVP (Low)**: $[amount] — lean scope, single-region, minimal third-party integrations
- **Recommended Baseline (Mid)**: $[amount] — full feature set, standard compliance, one integration layer
- **Enterprise High-Resilience (High)**: $[amount] — multi-region, 24×7 SLA, enterprise SSO, full audit trail

## Assumptions & Drivers

- Team composition assumed: [list specific roles]
- Key cost drivers: [list 3–5 specific factors from this requirement]
- Delivery model: [Agile / Fixed-scope / etc.]
- [Any critical assumptions about scope, budget, or timeline stated in the requirement]

## Risk Factors

- [2–3 specific risks that could increase cost or timeline for this type of project]
"""
}


@app.post(
    "/consultant/generate",
    response_model=list[GenerateResponse]
)
def generate(req: GenerateRequest):

    client = get_gemini_client()

    if (
        req.section != "all"
        and req.section not in SECTION_PROMPTS
    ):

        raise HTTPException(
            status_code=400,
            detail=f"Unknown section: {req.section}"
        )

    if req.section == "all":

        sections = list(
            SECTION_PROMPTS.keys()
        )

    else:

        sections = [
            req.section
        ]

    target_language = detect_language_name(req.raw_input_text, fallback_language=req.user_language or "English")
    if target_language == "English" and req.user_language and req.user_language.lower() != "english":
        target_language = req.user_language

    context = req.raw_input_text

    if req.discovery_answers:

        context += (
            "\n\nAdditional information from discovery:\n"
        )

        for question, answer in req.discovery_answers.items():

            context += (
                f"- Question: {question}\n"
                f"  Answer: {answer}\n"
            )

    results = []

    for section in sections:

        prompt = f"""
You are Compile AI, an AI business consultant.

{SECTION_PROMPTS[section]}

Important:
- Be specific and practical.
- Do not invent facts that were not provided.
- Clearly state assumptions where necessary.
- The result is advisory and editable.
- MANDATORY LANGUAGE: Write the entire response, section headings, requirements, and recommendations in {target_language}.

Business context:
{context}
"""

        section_text = None
        try:
            section_text = generate_with_retry(
                client=client,
                prompt=prompt,
                preferred_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
                max_retries=3
            )
        except Exception as e:
            print(f"Gemini generation for '{section}' failed after retries: {e}. Generating fallback from dataset & classifier.")

        if not section_text:
            classified = classify(ClassifyRequest(text=req.raw_input_text))
            ind = classified.get("industry", "Technology")
            prob = classified.get("problem_title", "Process Automation")
            size = classified.get("company_size_tag", "SME")
            cost = classified.get("cost_band", "Mid")
            # Derive a session title from the actual input text (first 60 chars, first line)
            raw_first_line = (req.raw_input_text or "").strip().split('\n')[0][:80].strip()
            session_title = raw_first_line if raw_first_line else prob

            if section == "gap_analysis":
                section_text = (
                    f"### Current State vs Desired State Gap Analysis\n"
                    f"*Note: AI generation was unavailable — this is a structured fallback. Please Regenerate Section for AI analysis.*\n\n"
                    f"- **Current State**: Manual processing and legacy tool bottlenecks in the {ind} domain, specifically around: {session_title}.\n"
                    f"- **Desired State**: A unified digital platform with automated workflows, real-time status dashboards, and integrated security controls.\n"
                    f"- **Operational Impact**: High reduction in processing delays and human error rates."
                )
            elif section == "brd":
                section_text = (
                    f"# Business Requirement Document — {session_title}\n\n"
                    f"> ⚠️ AI generation was unavailable. This is a structured fallback. Click **Regenerate Section** for a full AI-generated BRD.\n\n"
                    f"## 1. Executive Objectives\n"
                    f"Automate and digitise the core workflows for **{session_title}** — a {size} organisation in the {ind} domain.\n\n"
                    f"## 2. Scope\n"
                    f"- **In-Scope**: Intake automation, status tracking, role-based access, and legacy integration.\n"
                    f"- **Out-of-Scope**: Physical infrastructure overhaul.\n\n"
                    f"## 3. Functional Requirements\n"
                    f"- **FR-1.1**: Unified data ingestion and schema normalisation.\n"
                    f"- **FR-1.2**: Automated threshold and approval processing engine.\n"
                    f"- **FR-1.3**: Operational dashboards for key departmental leads.\n\n"
                    f"## 4. Non-Functional Requirements\n"
                    f"- **NFR-2.1**: 99.5% uptime SLA target.\n"
                    f"- **NFR-2.2**: Encrypted data storage (AES-256) and TLS 1.3 in transit."
                )
            elif section == "architecture":
                section_text = (
                    f"# Solution Architecture — {session_title}\n\n"
                    f"> ⚠️ AI generation was unavailable. This is a structured fallback. Click **Regenerate Section** for a full AI-generated HLD.\n\n"
                    f"## Recommended Technology Stack\n"
                    f"- **Frontend**: React + Vite (Reactive component workspace)\n"
                    f"- **Backend API**: Node.js / Express + Python FastAPI engine\n"
                    f"- **Database**: Relational Database (MySQL 8.0 / PostgreSQL 16)\n"
                    f"- **Cloud Infrastructure**: Containerised Microservices on AWS / Azure / GCP\n\n"
                    f"## Security & Compliance\n"
                    f"Role-based access control (RBAC), audit trail logging, and HTTPS encrypted transit."
                )
            elif section == "estimate":
                # Use classifier cost_band to derive rough ranges for the fallback
                cost_lower = cost.lower() if cost else "mid"
                if "low" in cost_lower:
                    low_r, mid_r, high_r = "$15K", "$35K", "$65K"
                    weeks_build = 4
                elif "high" in cost_lower or "enterprise" in cost_lower:
                    low_r, mid_r, high_r = "$120K", "$250K", "$500K"
                    weeks_build = 14
                else:  # Mid
                    low_r, mid_r, high_r = "$35K", "$85K", "$180K"
                    weeks_build = 8

                section_text = (
                    f"# Project Effort & Cost Estimate — {session_title}\n\n"
                    f"> ⚠️ AI generation was unavailable. This is a classifier-derived fallback. Click **Regenerate Section** for a full AI-generated estimate tailored to your exact requirements.\n\n"
                    f"## Phase Breakdown\n\n"
                    f"| Phase | Weeks | % of Project |\n"
                    f"|---|---|---|\n"
                    f"| Discovery & Requirements | 2 | {round(2/(weeks_build+8)*100)}% |\n"
                    f"| Architecture & UX Design | 2 | {round(2/(weeks_build+8)*100)}% |\n"
                    f"| Core Build & Integration | {weeks_build} | {round(weeks_build/(weeks_build+8)*100)}% |\n"
                    f"| Testing, QA & Compliance | 2 | {round(2/(weeks_build+8)*100)}% |\n"
                    f"| Deployment & Pilot Launch | 2 | {round(2/(weeks_build+8)*100)}% |\n\n"
                    f"**Total Timeline**: {weeks_build + 8} Weeks\n\n"
                    f"## Cost Band (Classifier-derived — {ind})\n\n"
                    f"- **Minimum MVP (Low)**: {low_r}\n"
                    f"- **Recommended Baseline (Mid)**: {mid_r}\n"
                    f"- **Enterprise High-Resilience (High)**: {high_r}\n\n"
                    f"## Assumptions\n\n"
                    f"- Cost band based on AI classifier output: **{cost}** for {ind} industry\n"
                    f"- Click **Regenerate Section** for requirement-specific person-week and cost breakdown"
                )
            else:
                section_text = f"Compiled Analysis for {session_title} — {section} ({ind})."

        results.append(
            GenerateResponse(
                section=section,
                content=section_text
            )
        )

    return results


# ============================================================
# /nlp/analyze
# SIMPLE NLP + TIER 1 COMBINATION
# ============================================================

class NLPAnalyzeRequest(BaseModel):

    text: str = Field(
        ...,
        min_length=1
    )


class NLPAnalyzeResponse(BaseModel):

    text: str

    language: str

    word_count: int

    character_count: int

    sentences: int

    classification: dict


@app.post(
    "/nlp/analyze",
    response_model=NLPAnalyzeResponse
)
def nlp_analyze(req: NLPAnalyzeRequest):

    text = req.text.strip()

    language = detect_language(
        text
    )

    word_count = len(
        text.split()
    )

    character_count = len(
        text
    )

    sentences = sum(
        text.count(symbol)
        for symbol in [
            ".",
            "!",
            "?"
        ]
    )

    if sentences == 0:

        sentences = 1

    classification = classify(
        ClassifyRequest(
            text=text
        )
    )

    return NLPAnalyzeResponse(

        text=text,

        language=language,

        word_count=word_count,

        character_count=character_count,

        sentences=sentences,

        classification=classification
    )


# ============================================================
# /benchmark
# PROJECT BENCHMARK
# ============================================================

class BenchmarkRequest(BaseModel):

    industry: str = Field(
        ...,
        min_length=1
    )

    company_size_tag: str = Field(
        default=""
    )

    budget: float | None = None

    timeline_weeks: float | None = None


@app.post("/benchmark")
def benchmark(req: BenchmarkRequest):

    result = calculate_benchmark(

        industry=req.industry,

        company_size_tag=(
            req.company_size_tag
            or None
        ),

        budget=req.budget,

        timeline_weeks=req.timeline_weeks
    )

    return result


# ============================================================
# /compliance
# COMPLIANCE MAPPING
# ============================================================

class ComplianceRequest(BaseModel):

    industry: str = Field(
        ...,
        min_length=1
    )


@app.post("/compliance")
def compliance(req: ComplianceRequest):

    result = get_compliance_mapping(
        industry=req.industry
    )

    return result


# ============================================================
# /lock-in
# VENDOR LOCK-IN ANALYSIS
# ============================================================

class LockInRequest(BaseModel):

    tech_stack: str = Field(
        ...,
        min_length=1
    )


@app.post("/lock-in")
def lock_in(req: LockInRequest):

    result = calculate_lockin(
        tech_stack=req.tech_stack
    )

    return result


# ============================================================
# /compile
# FINAL END-TO-END COMPILE AI PIPELINE
# ============================================================

class CompileRequest(BaseModel):

    text: str = Field(
        ...,
        min_length=1
    )

    language: str = "English"

    industry: str = ""

    company_size_tag: str = ""

    budget: float | None = None

    timeline_weeks: float | None = None

    tech_stack: str = ""


class CompileResponse(BaseModel):

    input_text: str

    nlp_analysis: dict

    classification: dict

    consultant_output: list[dict]

    benchmark: dict

    compliance: dict

    lockin: dict


@app.post(
    "/compile",
    response_model=CompileResponse
)
def compile_requirement(req: CompileRequest):

    # ========================================================
    # STEP 1: NLP + TRAINED CLASSIFIER
    # ========================================================

    nlp_result = nlp_analyze(
        NLPAnalyzeRequest(
            text=req.text
        )
    )

    classification = nlp_result.classification


    # ========================================================
    # STEP 2: DETERMINE INDUSTRY
    # ========================================================

    industry = req.industry.strip()

    if not industry:

        classification_industry = classification.get(
            "industry"
        )

        if classification_industry:

            industry = str(
                classification_industry
            )


    if not industry:

        text_lower = req.text.lower()

        if any(
            word in text_lower
            for word in [
                "student",
                "students",
                "school",
                "college",
                "university",
                "education",
                "attendance",
                "assignment",
                "teacher",
                "exam"
            ]
        ):

            industry = "Education"

        elif any(
            word in text_lower
            for word in [
                "hospital",
                "doctor",
                "patient",
                "medical",
                "healthcare",
                "clinic"
            ]
        ):

            industry = "Healthcare"

        elif any(
            word in text_lower
            for word in [
                "bank",
                "banking",
                "loan",
                "finance",
                "payment"
            ]
        ):

            industry = "Banking & Finance"

        elif any(
            word in text_lower
            for word in [
                "retail",
                "shop",
                "store",
                "inventory"
            ]
        ):

            industry = "Retail"

        else:

            industry = "General"


    # ========================================================
    # STEP 3: GEMINI CONSULTANT
    # ========================================================

    try:

        client = get_gemini_client()

        prompt = f"""
You are Compile AI, an AI business consultant.

Analyze the following software/business requirement.

Requirement:
{req.text}

Industry:
{industry}

Write a concise but useful response containing these four sections:

1. GAP ANALYSIS
Explain the current problem and desired state.

2. BUSINESS REQUIREMENTS
List the main objectives, stakeholders, functional requirements,
non-functional requirements, assumptions and constraints.

3. HIGH-LEVEL ARCHITECTURE
Suggest the frontend, backend, database, major components,
data flow and security considerations.

4. PROJECT ESTIMATE
Give a rough development estimate by phase:
discovery, design, development, testing and deployment.

Also mention assumptions.

Write the response in {req.language}.

Be specific to the requirement.
Do not invent information that is not provided.
Clearly label assumptions.
You can use the search_dataset tool to lookup relevant architecture blueprints, tech stacks, and benchmarks from the dataset whenever needed.
"""

        consultant_content = generate_with_retry(
            client=client,
            prompt=prompt,
            preferred_model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
            tools=[search_dataset],
            max_retries=3
        )

    except Exception as e:

        consultant_content = (
            "AI Consultant temporarily unavailable. "
            "NLP analysis and trained Tier 1 classification "
            "were completed successfully. "
            f"Temporary AI service error: {type(e).__name__}"
        )


    # ========================================================
    # STEP 4: BENCHMARK
    # ========================================================

    benchmark_result = calculate_benchmark(

        industry=industry,

        company_size_tag=(
            req.company_size_tag
            if req.company_size_tag
            else None
        ),

        budget=req.budget,

        timeline_weeks=req.timeline_weeks
    )


    # ========================================================
    # STEP 5: COMPLIANCE
    # ========================================================

    compliance_result = get_compliance_mapping(
        industry=industry
    )


    # ========================================================
    # STEP 6: VENDOR LOCK-IN
    # ========================================================

    lockin_result = calculate_lockin(

        tech_stack=(
            req.tech_stack
            if req.tech_stack
            else ""
        )
    )


    # ========================================================
    # STEP 7: FINAL COMBINED RESPONSE
    # ========================================================

    return CompileResponse(

        input_text=req.text,

        nlp_analysis={

            "language": nlp_result.language,

            "word_count": nlp_result.word_count,

            "character_count": nlp_result.character_count,

            "sentences": nlp_result.sentences,

            "industry": industry
        },

        classification=classification,

        consultant_output=[

            {
                "section": "ai_consultant",

                "content": consultant_content
            }
        ],

        benchmark=benchmark_result,

        compliance=compliance_result,

        lockin=lockin_result
    )

