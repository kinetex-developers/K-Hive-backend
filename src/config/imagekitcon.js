import ImageKit from 'imagekit';
import { randomUUID } from 'crypto';

let imagekit;

function getImageKitInstance() {
  if (imagekit) return imagekit;

  try {
    imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
    });
    return imagekit;
  } catch (err) {
    console.error("Unable to initialize ImageKit:", err.message);
    return null;
  }
}

function getUUID() {
  const uuid = randomUUID();
  // Convert UUID string to bytes then to base64
  const bytes = Buffer.from(uuid.replace(/-/g, ''), 'hex');
  const base64 = bytes.toString('base64url'); // base64url automatically removes padding
  return base64;
}

export function getPresignedUploadUrl(expireInSeconds = 60, folder = 'k-hive') {
  const imagekitInstance = getImageKitInstance();
  
  if (!imagekitInstance) {
    console.log("Imagekit Instance not Initialized");
    throw new Error("ImageKit not initialized");
  }

  // Generate a unique token using UUID
  const token = getUUID();
  
  // Calculate expire timestamp (current time + expireInSeconds)
  const expire = Math.floor(Date.now() / 1000) + expireInSeconds;

  const authParams = imagekitInstance.getAuthenticationParameters(token, expire);

  return {
    token: token,
    expire: authParams.expire,
    signature: authParams.signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    uploadUrl: `${process.env.IMAGEKIT_URL_ENDPOINT}/api/v1/files/upload`,
    folder: folder
  };
}

export async function deleteFileByUrl(fileUrl) {
  const imagekitInstance = getImageKitInstance();
  
  if (!imagekitInstance) {
    console.log("Imagekit Instance not Initialized");
    return false;
  }

  try {
    let urlEndpoint = process.env.IMAGEKIT_URL_DELIVERY;
    
    if (urlEndpoint.endsWith('/')) {
      urlEndpoint = urlEndpoint.slice(0, -1);
    }
    
    if (!fileUrl.startsWith(urlEndpoint)) {
      throw new Error("Invalid ImageKit URL");
    }

    let filePath = fileUrl.replace(urlEndpoint, '').split('?')[0];
    
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    
    const fileName = filePath.split('/').pop();
    
    const files = await imagekitInstance.listFiles({
      name: fileName
    });

    if (!files || files.length === 0) {
      throw new Error("File not found");
    }

    let file = files.find(f => f.filePath === filePath || f.filePath === `/${filePath}`);
    
    if (!file && files.length === 1) {
      file = files[0];
    }
    
    if (!file) {
      throw new Error("File not found with matching path");
    }

    await imagekitInstance.deleteFile(file.fileId);
    
    return true;
  } catch (err) {
    console.error("Error deleting file:", err.message);
    return false;
  }
}