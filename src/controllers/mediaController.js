import { getPresignedUploadUrl } from "../config/imagekitcon.js";

// Get presigned upload URL for client-side upload
export const getUploadCredentials = async (req, res) => {
  try {
    const uploadCredentials = getPresignedUploadUrl();

    res.status(200).json({
      success: true,
      message: "Upload credentials generated successfully",
      data: uploadCredentials,
    });
  } catch (err) {
    console.error("Error in getUploadCredentials:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate upload credentials",
      error: err.message,
    });
  }
};