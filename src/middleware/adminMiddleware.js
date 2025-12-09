import passport from "passport";

// Admin Authentication Middleware
export const isAdmin = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Authentication error",
      });
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please log in.",
      });
    }
    
    // Check if user has admin role
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Admin access required.",
      });
    }
    
    req.user = user;
    next();
  })(req, res, next);
};