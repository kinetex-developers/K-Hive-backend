import ImageKit from 'imagekit';

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

export function getPresignedUploadUrl(expireInSeconds = 60, folder = 'k-hive') {
  const imagekitInstance = getImageKitInstance();
  
  if (!imagekitInstance) {
    throw new Error("ImageKit not initialized");
  }

  const authParams = imagekitInstance.getAuthenticationParameters({
    expire: expireInSeconds
  });

  return {
    token: authParams.token,
    expire: authParams.expire,
    signature: authParams.signature,
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    uploadUrl: `${process.env.IMAGEKIT_URL_ENDPOINT}/api/v1/files/upload`,
    folder: folder
  };
}