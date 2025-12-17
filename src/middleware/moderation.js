import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers
} from "obscenity";

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

import {moderateImage} from "../utils/ImageModeration.js";

import { deleteFileByUrl } from "../config/imagekitcon.js";

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
    const { title = "", content = "" , tags=[], media} = req.body;

    if(tags.length>5)
    {
      return res.status(400).json({
        success: false,
        message: "Too many tags"
      });
    }

    for(const tag of tags){
      if(tag.length<2 || tag.length>20)
      {
        return res.status(400).json({
        success: false,
        message: "Use tags of length 2..20"
      });
      }
      if (matcher.hasMatch(tag)) {
        return res.status(400).json({
          success: false,
          message: "Your tags contain inappropriate language."
        });
      }
    }
    
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

    // Second check: AI moderation
    if (process.env.USE_AI_MODERATION === "true") {

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Fast and cheap
        generationConfig: {
          temperature: 0, // Best practice for classification
          responseMimeType: "application/json",
        },
        // Turn OFF safety filters as per documentation
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
        
        // Parse JSON response
        const result = JSON.parse(resultText);
        
        if (result.violation === "yes") {
          return res.status(400).json({
            success: false,
            message: "Your post violates community guidelines",
            category: result.harm_type
          });
        }
        if(media && media.length>0){
          for(const item of media){
            const isSafe = await moderateImage(item);
            if(!isSafe){
              for(const ditem of media){
                  await deleteFileByUrl(ditem);
              }
              return res.status(400).json({
                success: false,
                message: "One or more images violate community guidelines"
              });
            }
          }
        }
        console.log("Content passed AI moderation");
        
      } catch (aiError) {
        console.error("AI Moderation error:", aiError);
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