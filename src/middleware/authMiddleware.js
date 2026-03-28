import passport from "passport";
import User from "../models/User.js"
// JWT Authentication Middleware
export const isAuthenticated = (req, res, next) => {
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
    
    if(user.role.endsWith("-ban")){
      return res.status(401).json({
        success: false,
        message: "You have been Banned.",
      });
    }
    req.user = user;
    next();
  })(req, res, next);
};

export const attachUser = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (!err && user) {
      req.user = user;
      res.locals.user = user;
    }
    next();
  })(req, res, next);
};

export const isNotAuthenticated = (req, res, next) => {
  const token = req.cookies?.jwt || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return next();
  }
  const redirectUrl = `khive://auth?token=${encodeURIComponent(token)}`;

  return res.redirect(redirectUrl);
  /*
  return res.status(400).json({
    success: false,
    message: "Already authenticated.",
  });
  */
};