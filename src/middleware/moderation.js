import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers
} from "obscenity";

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

import {moderateImage} from "../utils/ImageModeration.js";

import {deleteFileById} from "../config/imagekitcon.js";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

export default async function moderation(req, res, next) {
  try {
    const { title = "", content = "" , tags=[], media, mediaId} = req.body;

    if(tags.length > 5) {
      if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
      return res.status(400).json({
        success: false,
        message: "Too many tags"
      });
    }

    for(const tag of tags){
      if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
      if(tag.length < 2 || tag.length > 20) {
        return res.status(400).json({
          success: false,
          message: "Use tags of length 2..20"
        });
      }
      if (matcher.hasMatch(tag)) {
        if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
        return res.status(400).json({
          success: false,
          message: "Your tags contain inappropriate language."
        });
      }
    }
    
    const text = (title + " " + content).trim();
    if (!text || text.length < 3) {
      if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
      return res.status(400).json({
        success: false,
        message: "Content is too short."
      });
    }

    // First check: Profanity filter
    if (matcher.hasMatch(text)) {
      if (mediaId && mediaId.length > 0) {
        deleteFilesByID(mediaId);
      }
      return res.status(400).json({
        success: false,
        message: "Your post contains inappropriate language."
      });
    }

    // Second check: AI text moderation
    if (process.env.USE_AI_MODERATION === "true") {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
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
          if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
          return res.status(400).json({
            success: false,
            message: "Your post violates community guidelines",
            category: result.harm_type
          });
        }
        
      } catch (aiError) {
        console.error("AI Moderation error:", aiError);
      }
    }
    
    // Third check: Image moderation
    if(media && media.length > 0) {
      for(const item of media){
        const isSafe = await moderateImage(item);
        
        if(!isSafe) {
          if (mediaId && mediaId.length > 0) {
            deleteFilesByID(mediaId);
          }
          return res.status(400).json({
            success: false,
            message: "One or more images violate community guidelines"
          });
        }
      }
    }
    
    next();
  } catch (err) {
    console.error("Moderation error:", err);
    if (req.body.mediaId && req.body.mediaId.length > 0) {
      await deleteFilesByID(req.body.mediaId);
    }
    next();
  }
}

async function deleteFilesByID(mediaIds) {
  if (!mediaIds || !Array.isArray(mediaIds)) {
    return;
  }
  
  for (const fileId of mediaIds) {
    try {
      await deleteFileById(fileId);
    } catch (error) {
      console.error(`Error deleting file ${fileId}:`, error);
    }
  }
}