import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers
} from "obscenity";

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import OpenAI from "openai";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const MODERATION_PROMPT = `You are a content moderator for a university forum. Your task is to analyze the provided input and classify it based on the following harm types:

* Sexual: Sexually suggestive or explicit content.
* Hate: Promotes violence against, threatens, or attacks people based on their protected characteristics.
* Harassment: Harass, intimidate, or bully others.
* Dangerous: Promotes illegal activities, self-harm, or violence towards oneself or others.
* Toxic: Rude, disrespectful, or unreasonable language.
* Violent: Depicts violence, gore, or harm against individuals or groups.
* Profanity: Obscene or vulgar language.
* Spam: Promotional content, repetitive posts, or irrelevant content.
* Academic Misconduct: Requests for cheating, plagiarism, or sharing exam answers.

Output should be in JSON format only, no other text:
{
  "violation": "yes" or "no",
  "harm_type": "category name or null",
  "reasoning": "brief explanation"
}

If you are unsure, default to "no" violation.

Input to moderate:`;

// OpenAI Moderation Function
async function checkOpenAIModeration(text) {
  try {
    const moderation = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = moderation.results[0];
    
    if (result.flagged) {
      // Find the category with highest score
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_, flagged]) => flagged)
        .map(([category]) => category);
      
      return {
        violation: true,
        category: flaggedCategories[0] || "inappropriate_content",
        scores: result.category_scores
      };
    }
    
    return { violation: false };
  } catch (error) {
    console.error("OpenAI Moderation error:", error);
    throw error;
  }
}

// Gemini Moderation Function
async function checkGeminiModeration(text) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      }
    ]
  });

  try {
    const prompt = `${MODERATION_PROMPT}\n\n${text}`;
    const response = await model.generateContent(prompt);
    const resultText = response.response.text();
    const result = JSON.parse(resultText);
    
    if (result.violation === "yes") {
      return {
        violation: true,
        category: result.harm_type,
        reasoning: result.reasoning
      };
    }
    
    return { violation: false };
  } catch (error) {
    console.error("Gemini Moderation error:", error);
    throw error;
  }
}

export default async function moderation(req, res, next) {
  try {
    const { title = "", content = "" } = req.body;
    const text = (title + " " + content).trim();

    if (!text || text.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Content is too short."
      });
    }

    // First check: Profanity filter
    if (matcher.hasMatch(text)) {
      return res.status(400).json({
        success: false,
        message: "Your post contains inappropriate language."
      });
    }

    // Second check: AI moderation (toggleable)
    if (process.env.USE_AI_MODERATION === "true") {
      const provider = process.env.MODERATION_PROVIDER || "gemini"; // Default to gemini
      
      try {
        let moderationResult;
        
        if (provider === "openai") {
          console.log("Using OpenAI moderation");
          moderationResult = await checkOpenAIModeration(text);
        } else if (provider === "gemini") {
          console.log("Using Gemini moderation");
          moderationResult = await checkGeminiModeration(text);
        } else {
          console.warn(`Unknown moderation provider: ${provider}. Defaulting to Gemini.`);
          moderationResult = await checkGeminiModeration(text);
        }
        
        if (moderationResult.violation) {
          return res.status(400).json({
            success: false,
            message: "Your post violates community guidelines",
            category: moderationResult.category
          });
        }
        
        console.log(`Content passed ${provider.toUpperCase()} moderation`);
        
      } catch (aiError) {
        console.error("AI Moderation error:", aiError);
        // Continue to next() if moderation fails
      }
    }
    
    // Passed all checks
    next();
  } catch (err) {
    console.error("Moderation error:", err);
    // Let request pass if moderation crashes
    next();
  }
}