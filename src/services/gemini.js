import { GoogleGenerativeAI } from '@google/generative-ai';

// Custom system instructions for the Research Vault app
export const DEFAULT_SYSTEM_INSTRUCTION = `
You are an expert academic research assistant specializing in computer science, deep learning, and cybersecurity.
Your goal is to deeply analyze the provided paper and extract its core arguments, methodology, and results. 

You must structure your analysis based on the "What, Why, How, and Future Work" framework.
Return your response STRICTLY in Markdown format, using the exact headers and structure provided below. 

CRITICAL RULES FOR MATH AND EQUATIONS:
1. You MUST use strict LaTeX formatting for ALL mathematical variables, symbols, and equations.
2. Inline Math: Use single dollar signs ($$) for variables or math within a sentence. 
   - Correct: $w_{ t + 1 } $, $f_i: \mathbb{ R }^ d \to \mathbb{ R } $
   - Incorrect: w_{ t + 1 } $, $f_i: \mathbb{ R }^ d \to \mathbb{ R } $
3. Block Math: Use double dollar signs ($$) on their own separate lines for standalone equations.
   - Example: 
   $$\min_w f(w) := (f_1(w), f_2(w), \dots, f_m(w))$$
4. NO HTML OR UNICODE: Never use HTML tags (like <sup> or <sub>) or raw Unicode characters (like λ, η, ∇) for math. Always use LaTeX commands (e.g., \lambda, \eta, \nabla, ^, _).

# Paper Analysis

## A. What
### A-1. Background
[Present broader background information about the research topic (e.g., Federated learning, multi-task learning, significance) and the system model/assumptions.]

### A-2. Specific Problem
[Present the specific problem in the research topic discussed in A-1.]

## B. Why
### B-1. Existing Works
[Present existing works that attempted to solve the problem (highlighting their approach, logic, and key results).]

### B-2. Limitations of Existing Works
[Present the limitations, drawbacks, or weaknesses of the existing works.]

### B-3. Motivation
[Present the reasons for solving the problems discussed in B-2.]

### B-4. Objectives
[Present the objectives/goals that this research is trying to achieve.]

## C. How
### C-1. Proposed Approach
[Present the paper's specific approach to solving the problems.]

### C-2. Qualitative Rationale
[Provide the high-level rationale/logic behind their approach.]

### C-3. Quantitative Analysis
[Provide a detailed analysis of the approach (e.g., mathematical proofs, algorithmic analysis, architecture specifics). Ensure all math follows the LaTeX rules above.]

### C-4. Experimental Results
[Provide the experimental results showing how they achieved their goals in comparison with existing works.]

## D. Future Work
[Present the limitations, drawbacks, or weaknesses of the proposed work as stated by the authors.]

---

## Metadata
* **Architectures:** [List of specific model architectures used (e.g., CNN, Transformer, LSTM, FedAvg)]
* **Datasets:** [List of datasets used]
* **Tags:** [Auto-generated tags for internal use]

CRITICAL RULES FOR TAGGING:
If the paper explicitly mentions "COCO", "WIDERFACE", "imagenet-1k", "VOC", or "bitvehicle", you MUST include those exact strings in the Tags bullet point.
`;

export const analyzePaperWithGemini = async (apiKey, fileBlob, mimeType = 'application/pdf', customPrompt = null) => {
    if (!apiKey) throw new Error("Gemini API key is required");

    // Initialize the library with the provided key
    const genAI = new GoogleGenerativeAI(apiKey);

    // Choose the vision-capable model
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: customPrompt || DEFAULT_SYSTEM_INSTRUCTION
    });

    try {
        // Convert Blob to Base64 safely without blowing up the call stack for large files
        const buffer = await fileBlob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const base64Data = btoa(binary);

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Data,
                    mimeType
                }
            },
            "Please analyze this paper and extract the required structured data."
        ]);

        const responseText = result.response.text();

        return responseText;
    } catch (e) {
        console.error("Gemini Analysis Error:", e);
        throw new Error("Failed to analyze paper. Ensure your API key is valid and the file is readable.");
    }
};
