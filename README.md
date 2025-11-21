## Stock Metadata Generator

Stock Metadata Generator is an AI‑assisted tool for creating high‑quality, platform‑ready metadata for stock content libraries.  
It generates optimized **titles, descriptions, and keyword sets** for microstock platforms such as **Adobe Stock**, **Shutterstock**, and **Freepik**, with a focus on platform rules, discoverability, and commercial safety.

The application is built as a modern **Next.js 14** app with a rich, interactive UI for **uploading images/video**, configuring generation options, validating outputs, and exporting metadata as CSV.

---

## Live demo

You can try the app directly here: **[Stock Metadata Generator Live](https://csvmest.netlify.app/)**.

---

## Who is this for?

- **Stock contributors & photographers**  
  Need fast, consistent, and compliant metadata for large batches of images or video.

- **Illustrators, vector artists, and designers**  
  Want metadata that respects vector/illustration specifics and platform style rules.

- **Production studios / agencies**  
  Managing high volumes of commercial assets and requiring standardized, high‑quality titles and keywords.

- **Tool builders & developers**  
  Looking for a reference implementation of AI‑powered, multimodal metadata generation on top of Next.js.

---

## Core features

- **AI‑powered metadata generation**
  - Generates **title**, **description**, and **EXACT keyword counts** per platform.
  - Uses **Google Gemini** and/or **Mistral** as backend language models.
  - Supports **platform‑specific rules** (e.g. Adobe Stock restrictions, title length, keyword ordering).

- **Multimodal image support**
  - Accepts images and (for some flows) video.
  - Sends **base64‑encoded image data** to Gemini for visual analysis.
  - Enforces rules around **transparent vs white backgrounds**, vector vs photo, illustration flags, etc.

- **Platform‑aware compliance**
  - Adobe Stock logic:
    - Validates title length and structure.
    - Detects and rejects style references and third‑party IP (brands, artists, etc.).
    - Normalizes and enriches keywords, including scientific names where applicable.
  - Enforces:
    - Exact keyword count (e.g. 49 keywords for Adobe workflows).
    - No banned or model‑name keywords (e.g. “gemini”, “mistral”).
    - Duplicate and formatting checks.

- **Batch & per‑file generation**
  - **Batch mode** to process many files with concurrency limits to avoid rate limits.
  - **Single mode** for safer, sequential processing.
  - **Per‑file “Generate / Regenerate”** buttons and **“Regenerate All”** for files that already have results.

- **Robust retry & resilience**
  - Exponential backoff with **smart retry logic** for 429/5xx/overloaded responses.
  - Real‑time **retry status indicators** in the UI (via Server‑Sent Events and `retry-tracker`).

- **Quality scoring & guidance**
  - Internal **title quality scoring** with strengths/issues.
  - Highlights weak titles and low‑quality outputs for manual review.
  - Animated keyword reveal and visual cues for completion/success/error.

- **History, templates, and bulk editing**
  - **History viewer**: restore previous generations.
  - **Template manager**: save/load generation presets (platform, lengths, negative keywords, etc.).
  - **Bulk editor** for mass adjustments before export.

- **CSV export for microstock upload**
  - Exports a clean CSV with columns ready to be mapped to stock platforms.
  - Uses `;`‑separated keywords in a single field for easy import.

- **Local API key management**
  - “**API Secrets**” UI for managing Gemini/Mistral keys.
  - Keys are **stored locally and securely** (via encrypted client‑side storage), not hard‑coded.

---

## Tech stack

- **Framework & Runtime**
  - **Next.js 14** (App Router)
  - **React 18**
  - **TypeScript**

- **Styling & UI**
  - **Tailwind CSS** for utility‑first styling.
  - Custom components for upload, progress, tables, analytics, templates, and toasts.

- **Validation & utilities**
  - **Zod** for request body validation on API routes.
  - Custom utilities for:
    - Filename parsing and hint extraction
    - Title/keyword scoring and normalization
    - CSV generation
    - Image compression & caching

- **Image & file handling**
  - **Sharp** for server‑side image processing/compression (where applicable).
  - Client‑side **blob URL previews** and **size validation**.
  - Files are persisted under `public/uploads` (with in‑app clear functionality).

- **AI providers**
  - **Google Gemini** (Gemini 2.5 Flash and related models).
  - **Mistral** (`mistral-small-latest`).
  - Pluggable provider layer with shared prompt builder and validation.

---

## Project structure (high level)

- **`src/app`**
  - `page.tsx`: Main UI combining settings, uploads, results, analytics, and history.
  - `api/generate/route.ts`: Primary metadata generation endpoint.
  - Other routes: health checks, Adobe‑specific helpers, upload/retry utilities.

- **`src/components`**
  - `FileDrop`: drag‑and‑drop uploads, generate/regenerate, progress, per‑file cards.
  - `APIControls`, `KeyModal`: model provider selection and API key management.
  - `AdvancedMetadataControls`: detailed controls (platform, asset type, negative keywords, etc.).
  - `ResultTable`, `BulkEditor`, `HistoryViewer`, `Analytics`, and various UI helpers.

- **`src/lib`**
  - `models.ts`: AI provider integration, prompt building, and fallback logic.
  - `microstock.ts`: Adobe‑focused generation logic and sanitization.
  - `csv.ts`: CSV row type and export utility.
  - `keyword-enrichment.ts`, `smart-defaults.ts`, `retry-tracker.ts`, `retry-sse.ts`, etc.

---

## Getting started

### Prerequisites

- **Node.js** ≥ 18 (Node 20 recommended)
- **npm** (or another package manager such as pnpm/yarn)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will start on `http://localhost:3000` by default.

### Production build

```bash
npm run build
npm start
```

---

## Configuration

You can provide AI API keys in two ways:

- **Via environment variables** (useful for server deployments):
  - Set these in `.env.local` (not committed to git):

    ```bash
    GEMINI_API_KEY=your_gemini_api_key_here
    MISTRAL_API_KEY=your_mistral_api_key_here
    ```

- **Via the in‑app “API Secrets” modal** (ideal for local use / browser‑side management):
  - Click **API Secrets** in the header or settings panel.
  - Add one or more **Gemini** and/or **Mistral** keys.
  - Select the **active provider** and active key.
  - Keys are stored **locally and encrypted**, and sent as bearer tokens with generation requests.

The generation API will:

- Prefer a **non‑empty bearer token** from the client (API Secrets modal).
- Fall back to `GEMINI_API_KEY` / `MISTRAL_API_KEY` env vars if set.
- Return clear error messages if no valid key is available.

---

## Usage

1. **Start the app**
   - Run `npm run dev` and open `http://localhost:3000`.

2. **Configure API keys**
   - Open **API Secrets**.
   - Add your **Gemini** and/or **Mistral** API keys.
   - Select which provider to use.

3. **Set generation parameters**
   - Choose **platform**: Adobe / Freepik / Shutterstock.
   - Configure:
     - **Title length** (e.g. Adobe recommended 70 chars).
     - **Description length** (150 chars).
     - **Keyword count** (e.g. 41 or Adobe‑style 49).
     - **Asset type**: photo, illustration, vector, 3D, icon, video, or auto.
     - Optional:
       - Prefix/suffix.
       - Negative title/keyword terms.
       - Video hints (style/tech).
       - “Is vector / illustration” and background toggles.

4. **Upload files**
   - Drag & drop files into the upload area, or click to pick.
   - Supported formats: **PNG, JPG, JPEG, WEBP, SVG, EPS, AI, MP4, MOV, M4V, WEBM**.
   - Files are listed with previews, sizes, and extensions.

5. **Generate metadata**
   - Click **“Generate All”** to process every file using current settings, or
   - Use the **per‑file Generate / Regenerate** button on each card.
   - Watch progress bars and retry indicators; errors per file are surfaced in the UI.

6. **Review & refine**
   - Inspect titles, descriptions, and keywords.
   - Use built‑in **quality scores** to identify weak titles.
   - Optionally use the **Bulk Editor** for mass edits.

7. **Export CSV**
   - Once satisfied, click **“Export CSV”**.
   - A CSV file (`stock-metadata.csv`) is generated with one row per asset.

8. **Upload to platforms**
   - Use the CSV in your microstock workflow, mapping fields as needed.

---

## CSV output format

Each row in the exported CSV has the following columns:

- **`filename`**
- **`platform`** (Adobe / Freepik / Shutterstock)
- **`title`**
- **`description`**
- **`keywords`** (single field, `;`‑separated)
- **`asset_type`**
- **`extension`**
- **`title_length`** (configured limit at generation time)
- **`description_length`**
- **`keywords_count`**

Errors (if any) are surfaced in the UI and encoded into the title/description for that row, so you can see which items need manual attention.

---

## Error handling & validation

- **Client‑side**
  - File size validation and supported extension checks.
  - Visual indicators for upload failures and oversize files.

- **Server‑side**
  - Zod schema validation of request bodies.
  - Smart keyword normalization and deduplication.
  - Adobe‑specific validation:
    - Title style, length, and content rules.
    - Keyword structure, order, and de‑genericization.
    - Detection of brand names, style references, and personal names.
  - **Quality scoring** for titles; extremely low‑quality outputs are rejected and flagged as errors.

- **AI provider errors**
  - Detailed logs for invalid API keys, malformed responses, and rate limits.
  - Exponential backoff with retry, plus live retry indicators in the UI.

---

## Privacy & data considerations

- Uploaded files are stored on the server under `public/uploads` and can be cleared from the UI.
- Image data is sent only to the configured AI providers (Gemini/Mistral) for analysis when needed.
- API keys managed via the **API Secrets** modal are stored **locally (client‑side) in encrypted form** and are not committed to the repository.

You should review and adapt this behavior to your own privacy, compliance, and hosting requirements.

---

## Deployment

This app is designed to run on platforms that support **Next.js 14 App Router** (e.g. Vercel, Netlify, or a custom Node server).  
See the accompanying deployment notes (e.g. `VERCEL_DEPLOYMENT.md` / `DEPLOY_NETLIFY.md`) or adapt the standard Next.js deployment guides for your environment.

At minimum, ensure:

- Required environment variables (`GEMINI_API_KEY`, `MISTRAL_API_KEY` if used) are set.
- File system writes to `public/uploads` are allowed (or adjust storage strategy).
- The Next.js serverless/runtime configuration matches your hosting provider’s limits.

---

## License

Specify your license here (for example, **MIT**, **Apache‑2.0**, or a proprietary “All rights reserved” notice).


