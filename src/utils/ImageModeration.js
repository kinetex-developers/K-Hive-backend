import axios from 'axios';

//Moderate an image URL
export async function moderateImage(imageUrl) {
  try {
    // Try Sightengine first
    const sightengineResult = await moderateWithSightengine(imageUrl);
    return sightengineResult;
    } catch (sightengineError) {
    console.error('Sightengine moderation failed:', sightengineError.message);
    }

  try {
      // Fallback to Cloudinary
      const cloudinaryResult = await moderateWithCloudinary(imageUrl);
      return cloudinaryResult;
    } catch (cloudinaryError) {
      console.error('Cloudinary moderation failed:', cloudinaryError.message);
    }

    return true;
}

//Sightengine (Primary)
async function moderateWithSightengine(imageUrl) {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;
  
  if (!apiUser || !apiSecret) {
    throw new Error('Sightengine credentials not configured');
  }
  
  const response = await axios.get('https://api.sightengine.com/1.0/check.json', {
    params: {
      url: imageUrl,
      models: 'nudity-2.0,wad,offensive,gore',
      api_user: apiUser,
      api_secret: apiSecret
    },
    timeout: 15000,
    validateStatus: (status) => status < 500
  });
  
  const data = response.data;
  
  if (data.status === 'failure') {
    console.error('Sightengine API error:', data.error);
    throw new Error(`Sightengine API error: ${data.error?.message || 'Unknown error'}`);
  }

  if (data.status !== 'success') {
    throw new Error('Sightengine returned status: ${data.status}');
  }
  
  // Evaluate Sightengine scores - stricter thresholds
  const isBlocked = 
    // Nudity checks
    (data.nudity?.sexual_activity > 0.6) ||
    (data.nudity?.sexual_display > 0.6) ||
    (data.nudity?.erotica > 0.6) ||
    (data.nudity?.raw > 0.7) ||
    // Violence/gore
    (data.gore?.prob > 0.6) ||
    // Weapons/Alcohol/Drugs
    (data.weapon > 0.7) ||
    (data.alcohol > 0.7) ||
    (data.drugs > 0.7) ||
    // Offensive content
    (data.offensive?.prob > 0.6);
  
  return !isBlocked; 
}

//Cloudinary (Fallback) 
async function moderateWithCloudinary(imageUrl) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured');
  }
  
  try {
  // Use Cloudinary's moderation API
  const uploadResponse = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
        file: imageUrl,
        moderation: 'aws_rek',
        api_key: apiKey,
        timestamp: Math.floor(Date.now() / 1000),
        signature: generateCloudinarySignature(cloudName, apiKey, apiSecret)
    },
    { timeout: 20000 }
    );

    const moderationData = uploadResponse.data.moderation;
    
    if (!moderationData || moderationData.length === 0) {
      throw new Error('No moderation data returned');
    }
    // Check for explicit content
    const awsRekData = moderationData[0]?.aws_rek;
    if (!awsRekData) {
      throw new Error('AWS Rekognition data not available');
    }

    const hasExplicitContent = awsRekData.moderation_labels?.some(label => 
      label.Confidence > 70 && 
      ['Explicit Nudity', 'Graphic Violence Or Gore', 'Visually Disturbing'].includes(label.Name)
    );

    return !hasExplicitContent;

    } catch (error) {
    console.error('Cloudinary error details:', error.response?.data || error.message);
    throw error;
  }
}
  