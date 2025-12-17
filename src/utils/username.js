import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers
} from "obscenity";

import { 
  uniqueNamesGenerator, 
  adjectives, 
  colors, 
  animals,
  NumberDictionary
} from 'unique-names-generator';

// Initialize the profanity matcher
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers
});

// List of reserved/misleading names
const reservedNames = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'professor',
  'prof',
  'teacher',
  'instructor',
  'faculty',
  'staff',
  'system',
  'root',
  'support',
  'help',
  'official',
  'verified',
  'dean',
  'principal',
  'head',
  'director',
  'coordinator',
  'manager',
  'supervisor',
  'college',
  'university',
  'institution',
  'department',
  'dept'
];

export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, reason: 'Username is required and must be a string' };
  }

  const normalizedUsername = username.trim().toLowerCase();

  if (normalizedUsername.length < 3) {
    return { valid: false, reason: 'Username must be at least 3 characters long' };
  }

  if (normalizedUsername.length > 30) {
    return { valid: false, reason: 'Username cannot exceed 30 characters' };
  }

  if (matcher.hasMatch(normalizedUsername)) {
    return { valid: false, reason: 'Username contains inappropriate language' };
  }

  if (reservedNames.includes(normalizedUsername)) {
    return { valid: false, reason: 'This username is reserved and cannot be used' };
  }

  for (const reserved of reservedNames) {
    if (normalizedUsername.includes(reserved)) {
      return { valid: false, reason: 'Username contains reserved words that could be misleading' };
    }
  }

  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(username.trim())) {
    return { valid: false, reason: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true, reason: 'Username is valid' };
}

export function generateUsername(options = {}) {
  const {
    style = 'capital',
    separator = '',
    category = 'colorAnimals',
    addNumber = false
  } = options;

  // Select dictionaries based on category
  let dictionaries;
  switch (category) {
    case 'animals':
      dictionaries = [adjectives, animals];
      break;
    case 'colors':
      dictionaries = [colors, adjectives];
      break;
    case 'colorAnimals':
      dictionaries = [colors, animals];
      break;
    case 'mixed':
    default:
      dictionaries = [adjectives, colors, animals];
  }

  // Add number dictionary if requested
  if (addNumber) {
    dictionaries.push(NumberDictionary.generate({ min: 1, max: 999 }));
  }

  const username = uniqueNamesGenerator({
    dictionaries,
    style,
    separator,
    length: addNumber ? dictionaries.length : dictionaries.length
  });

  return username;
}